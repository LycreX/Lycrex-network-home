use rimplog::{LoggerBuilder, init_logger};

pub fn init_log() {
    let logger = LoggerBuilder::default();
    init_logger(logger);
}
