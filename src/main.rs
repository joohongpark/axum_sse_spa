use axum::{
    body::Body,
    extract::{Path, State},
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Extension, Json, Router,
};
use futures::stream::{self, Stream, StreamExt};
use mime_guess::from_path;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    convert::Infallible,
    process,
    sync::{Arc, Mutex},
};
use tokio::sync::broadcast;

#[derive(RustEmbed)]
#[folder = "asset/"]
struct Asset;

#[derive(Deserialize, Serialize)]
struct Data(HashMap<String, String>); // 클라이언트 고유 ID와 시간 정보를 담는 구조체

#[tokio::main]
async fn main() {
    let (tx, _) = broadcast::channel::<HashMap<String, String>>(256);
    let schedule_item = SharedScheduleItem::default();

    let app = Router::new()
        .route("/", get(serve_index))
        .route("/assets/{*file}", get(serve_file))
        .route("/sse/{user_id}", get(sse_handler))
        .route("/time", post(set_time_handler))
        .layer(Extension(tx))
        .with_state(ScheduleItemStateDyn {
            schedule_item: Arc::new(schedule_item.clone()),
        });
    let listener = tokio::net::TcpListener::bind("0.0.0.0:7777").await.unwrap();
    println!(
        "server {} listening on {}",
        process::id(),
        listener.local_addr().unwrap(),
    );
    axum::serve(listener, app).await.unwrap();
}

async fn serve_index() -> Result<Response<Body>, (StatusCode, String)> {
    // serve_file 함수를 호출할 때 index.html 경로를 직접 하드코딩합니다.
    serve_file(Path("index.html".to_string())).await
}

async fn sse_handler(
    Extension(tx): Extension<broadcast::Sender<HashMap<String, String>>>,
    State(state): State<ScheduleItemStateDyn>,
    Path(user_id): Path<String>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let once_msg = state
        .schedule_item
        .keys()
        .iter()
        .map(|key| {
            format!(
                "{}:{}",
                key.clone(),
                state.schedule_item.get_schedule(key.clone()).unwrap()
            )
        })
        .collect::<Vec<_>>()
        .join("|");
    let initial = stream::once(async { Ok::<Event, Infallible>(Event::default().data(once_msg)) });

    let rx = tx.subscribe();
    let events = stream::unfold(
        (rx, state, user_id),
        |(mut rx, state, user_id)| async move {
            match rx.recv().await {
                Ok(msg) => {
                    // state.schedule_item 에서 user_id 제외 모두 반환
                    let keys = state.schedule_item.keys();
                    let msg: String = keys
                        .iter()
                        .filter(|key| *key != &user_id)
                        .map(|key| {
                            format!(
                                "{}:{}",
                                key.clone(),
                                state.schedule_item.get_schedule(key.clone()).unwrap()
                            )
                        })
                        .collect::<Vec<_>>()
                        .join("|");
                    let event = Event::default().data(msg);
                    Some((Ok(event), (rx, state, user_id)))
                }
                // Err(broadcast::error::RecvError::Lagged(_)) => {
                //     // Lagged 경우에도 계속 진행하도록 처리할 수 있음
                //     Some((Ok(Event::default().data("Lagged".into())), rx))
                // }
                Err(broadcast::error::RecvError::Lagged(_)) => None,
                Err(broadcast::error::RecvError::Closed) => None,
            }
        },
    );

    let stream = initial.chain(events);
    Sse::new(stream)
}

// 요청 경로에 해당하는 파일을 찾아 응답합니다.
async fn serve_file(Path(filename): Path<String>) -> Result<Response<Body>, (StatusCode, String)> {
    // 임베딩된 파일을 검색합니다.
    match Asset::get(&filename) {
        Some(content) => {
            // mime 타입 추론
            let mime_type = from_path(&filename).first_or_octet_stream();
            // 파일 데이터를 응답 바디로 변환
            let body = Body::from(content.data);
            // let body = body::boxed(axum::body::Full::from(content.data));
            let response = Response::builder()
                .header("Content-Type", mime_type.to_string())
                .body(body)
                .unwrap();
            Ok(response)
        }
        None => Err((StatusCode::NOT_FOUND, format!("Not Found: {}", filename))),
    }
}

async fn set_time_handler(
    Extension(tx): Extension<broadcast::Sender<HashMap<String, String>>>,
    State(state): State<ScheduleItemStateDyn>,
    Json(payload): Json<Data>,
) -> Result<impl IntoResponse, StatusCode> {
    let data = payload.0;
    for (key, value) in data.iter() {
        state.schedule_item.set_schedule(key.clone(), value.clone());
        println!("recv {}: {}", key, value);
    }
    let _ = tx.send(data.clone());
    Ok((StatusCode::OK, "OK"))
}

#[derive(Clone)]
struct ScheduleItemStateDyn {
    schedule_item: Arc<dyn ScheduleItem>,
}

#[derive(Debug, Clone, Default)]
struct SharedScheduleItem {
    map: Arc<Mutex<HashMap<String, String>>>,
}

trait ScheduleItem: Send + Sync {
    fn get_schedule(&self, id: String) -> Option<String>;
    fn set_schedule(&self, id: String, schedule: String);
    fn keys(&self) -> Vec<String>;
}

impl ScheduleItem for SharedScheduleItem {
    fn get_schedule(&self, id: String) -> Option<String> {
        self.map.lock().unwrap().get(&id).cloned()
    }

    fn set_schedule(&self, id: String, schedule: String) {
        self.map.lock().unwrap().insert(id, schedule);
    }

    fn keys(&self) -> Vec<String> {
        self.map.lock().unwrap().keys().cloned().collect()
    }
}
