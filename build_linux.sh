#!/bin/bash

# 设置 Docker 平台
export DOCKER_DEFAULT_PLATFORM=linux/amd64

# 使用 musl 目标编译
cross build --release --target x86_64-unknown-linux-musl

# 复制配置文件到目标目录
cp config.toml target/x86_64-unknown-linux-musl/release/

echo "编译完成！可执行文件位于: target/x86_64-unknown-linux-musl/release/hutao-home"