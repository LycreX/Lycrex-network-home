use include_dir::{include_dir, Dir};
use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    body::Body,
    extract::Path,
};

// 在编译时嵌入静态文件目录
static STATIC_DIR: Dir<'_> = include_dir!("$CARGO_MANIFEST_DIR/home/static");

pub async fn serve_static_file(Path(path): Path<String>) -> impl IntoResponse {
    let path = path.trim_start_matches('/');
    
    // 查找文件
    if let Some(file) = STATIC_DIR.get_file(path) {
        // 获取文件内容
        let content = file.contents();
        
        // 根据文件扩展名设置 Content-Type
        let content_type = match path.split('.').last() {
            Some("css") => "text/css",
            Some("js") => "application/javascript",
            Some("html") => "text/html",
            Some("png") => "image/png",
            Some("jpg") | Some("jpeg") => "image/jpeg",
            Some("gif") => "image/gif",
            Some("svg") => "image/svg+xml",
            Some("ico") => "image/x-icon",
            _ => "application/octet-stream",
        };
        
        // 返回响应
        Response::builder()
            .status(StatusCode::OK)
            .header("Content-Type", content_type)
            .body(Body::from(content.to_vec()))
            .unwrap()
    } else {
        // 文件未找到
        StatusCode::NOT_FOUND.into_response()
    }
} 