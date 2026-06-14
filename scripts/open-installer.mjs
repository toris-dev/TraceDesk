import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const bundleRoot = join(process.cwd(), "src-tauri/target/release/bundle");

function findInstaller() {
  if (process.platform === "darwin") {
    const dmgDir = join(bundleRoot, "dmg");
    if (existsSync(dmgDir)) {
      const dmg = readdirSync(dmgDir).find((name) => name.endsWith(".dmg") && !name.startsWith("rw."));
      if (dmg) return join(dmgDir, dmg);
    }
    const app = join(bundleRoot, "macos/TraceDesk.app");
    if (existsSync(app)) return app;
  }

  if (process.platform === "win32") {
    for (const dir of ["nsis", "msi"]) {
      const folder = join(bundleRoot, dir);
      if (!existsSync(folder)) continue;
      const installer = readdirSync(folder).find(
        (name) => name.endsWith(".exe") || name.endsWith(".msi"),
      );
      if (installer) return join(folder, installer);
    }
  }

  for (const dir of ["deb", "appimage", "rpm"]) {
    const folder = join(bundleRoot, dir);
    if (!existsSync(folder)) continue;
    const pkg = readdirSync(folder).find((name) =>
      [".deb", ".AppImage", ".rpm"].some((ext) => name.endsWith(ext)),
    );
    if (pkg) return join(folder, pkg);
  }

  return null;
}

const artifact = findInstaller();
if (!artifact) {
  console.error("설치 파일을 찾지 못했습니다. src-tauri/target/release/bundle/ 를 확인하세요.");
  process.exit(1);
}

console.log(`설치 파일: ${artifact}`);

if (process.platform === "win32") {
  execSync(`start "" "${artifact}"`, { stdio: "inherit", shell: true });
} else if (process.platform === "darwin") {
  execSync(`open "${artifact}"`, { stdio: "inherit" });
} else {
  console.log("Linux: 위 경로의 패키지 파일을 직접 실행하세요.");
}
