use std::process::Command;

fn main() {
    // 获取Git提交哈希
    let output = Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output();
    
    if let Ok(output) = output {
        if output.status.success() {
            if let Ok(git_hash) = String::from_utf8(output.stdout) {
                let git_hash = git_hash.trim();
                println!("cargo:rustc-env=GIT_COMMIT_HASH={}", git_hash);
            }
        }
    }
    
    // 强制在Git提交后重新构建
    println!("cargo:rerun-if-changed=.git/HEAD");
    println!("cargo:rerun-if-changed=.git/refs/heads");
} 