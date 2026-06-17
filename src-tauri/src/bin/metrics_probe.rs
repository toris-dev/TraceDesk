use std::time::Instant;
use tracedesk_lib::system::{collect_snapshot, create_monitor};

fn main() {
    let mut mon = create_monitor();
    let mut times = Vec::new();

    for i in 1..=10 {
        let start = Instant::now();
        let snap = collect_snapshot(&mut mon).expect("collect_snapshot failed");
        let ms = start.elapsed().as_secs_f64() * 1000.0;
        times.push(ms);

        println!("--- snapshot {i} ({ms:.1}ms) ---");
        println!("  CPU: {:.1}%", snap.cpu_usage_percent);
        println!(
            "  MEM: {} / {} MB ({:.1}%)",
            snap.memory.used_mb, snap.memory.total_mb, snap.memory.used_percent
        );
        println!("  ports: {}", snap.port_count);
        println!("  top_processes: {}", snap.top_processes.len());
        if let Some(td) = &snap.tracedesk {
            println!(
                "  tracedesk: {} pid={} cpu={:.1}% mem={}MB",
                td.name, td.pid, td.cpu_percent, td.memory_mb
            );
        }

        let ok_mem = snap.memory.total_mb > 0
            && snap.memory.used_percent >= 0.0
            && snap.memory.used_percent <= 100.0;
        let ok_cpu = snap.cpu_usage_percent >= 0.0 && snap.cpu_usage_percent <= 100.0;
        println!("  valid: mem={ok_mem} cpu={ok_cpu}");

        if !ok_mem || !ok_cpu {
            eprintln!("VALIDATION FAILED");
            std::process::exit(1);
        }
    }

    let avg = times.iter().sum::<f64>() / times.len() as f64;
    let max = times.iter().cloned().fold(0.0, f64::max);
    println!("\n=== summary ({}) ===", std::env::consts::OS);
    println!("avg: {avg:.1}ms  max: {max:.1}ms");
    println!("PASS");
}
