use axum::{
    body::Body,
    extract,
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Router,
};
use futures::stream::{self, Stream};
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
        .route("/", get(main_page_handler))
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

async fn main_page_handler() -> Result<Response, (StatusCode, &'static str)> {
    // TODO: asset 경로 및 파일 설정 필요
    let body = Asset::get("index.html").unwrap();
    let response = Response::builder()
        .status(StatusCode::OK)
        .header("content-type", "text/html")
        .body(Body::from(body.data))
        .unwrap();
    return Ok(response.into_response());
}

async fn set_time_handler(
    extract::Json(payload): extract::Json<Data>,
) -> Result<Response, (StatusCode, &'static str)> {
    println!("input: {}", payload.data);
    Ok("hello world".into_response())
}
