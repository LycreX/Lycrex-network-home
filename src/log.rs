use rimplog::{init_logger, LoggerBuilder, LoggerPreset};

pub fn init_log() {
    let logger = LoggerBuilder {
        level: "INFO".to_string(),
        only_project_logs: false,
        path_depth: 0,
        time_format: "%Y-%m-%d %H:%M:%S".to_string(),
        preset: LoggerPreset::SIMPLE,
    };
    init_logger(logger);
}
