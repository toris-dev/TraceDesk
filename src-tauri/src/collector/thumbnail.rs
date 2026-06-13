use anyhow::{Context, Result};
use image::GenericImageView;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const MAX_DIMENSION: u32 = 320;
const FILE_STABLE_RETRIES: u32 = 12;
const FILE_STABLE_DELAY: Duration = Duration::from_millis(150);

pub fn thumbnails_dir() -> PathBuf {
    crate::database::connection::data_dir().join("thumbnails")
}

pub fn create_screenshot_thumbnail(source: &Path, event_id: i64) -> Result<PathBuf> {
    wait_for_stable_file(source)?;

    let thumb_dir = thumbnails_dir();
    fs::create_dir_all(&thumb_dir).context("failed to create thumbnails directory")?;

    let dest = thumb_dir.join(format!("{event_id}.jpg"));
    let img = image::open(source).with_context(|| format!("failed to open screenshot: {}", source.display()))?;
    let (width, height) = img.dimensions();
    let thumb = if width > MAX_DIMENSION || height > MAX_DIMENSION {
        img.thumbnail(MAX_DIMENSION, MAX_DIMENSION)
    } else {
        img
    };

    thumb
        .save_with_format(&dest, image::ImageFormat::Jpeg)
        .with_context(|| format!("failed to write thumbnail: {}", dest.display()))?;

    tracing::debug!(event_id, path = %dest.display(), "screenshot thumbnail created");
    Ok(dest)
}

fn wait_for_stable_file(path: &Path) -> Result<()> {
    let mut last_len = None;
    for _ in 0..FILE_STABLE_RETRIES {
        if !path.exists() {
            std::thread::sleep(FILE_STABLE_DELAY);
            continue;
        }
        let len = fs::metadata(path)
            .with_context(|| format!("failed to stat screenshot: {}", path.display()))?
            .len();
        if len > 0 && last_len == Some(len) {
            return Ok(());
        }
        last_len = Some(len);
        std::thread::sleep(FILE_STABLE_DELAY);
    }
    anyhow::bail!(
        "screenshot file not ready: {}",
        path.display()
    )
}
