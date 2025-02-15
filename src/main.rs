use axum::{
    body::{self, Body},
    extract::{self, Path},
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Router,
};
use futures::stream::{self, Stream};
use mime_guess::from_path;
use rust_embed::RustEmbed;
use serde::{Deserialize, Serialize};
use std::{convert::Infallible, process, time::Duration};
use tokio_stream::StreamExt as _;

#[derive(RustEmbed)]
#[folder = "asset/"]
struct Asset;

#[derive(Deserialize, Serialize)]
struct Data {
    data: String,
}

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(serve_index))
        .route("/assets/{*file}", get(serve_file))
        .route("/sse", get(sse_handler))
        .route("/time", post(set_time_handler));
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

async fn sse_handler() -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // SSE 샘플코드
    let stream = stream::repeat_with(|| Event::default().data("태어나서 해본 적 없어 난 공부"))
        .map(Ok)
        .throttle(Duration::from_secs(1));

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(Duration::from_secs(1))
            .text("keep-alive-text"),
    )
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
    extract::Json(payload): extract::Json<Data>,
) -> Result<Response, (StatusCode, &'static str)> {
    println!("input: {}", payload.data);
    Ok("hello world".into_response())
}
