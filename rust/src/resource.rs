//! stdin, stdout, stderr, and opt-in process resources.

use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::process::CommandExt;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

const MAX_WAIT: Duration = Duration::from_secs(60 * 60 * 24 * 365);

#[derive(Debug)]
pub enum ReadFail {
    Timeout,
    Message(String),
}

enum LineEvent {
    Line(String),
    Eof,
}

enum ProcEvent {
    Line(String),
    Eof,
    Exited { code: Option<i32>, stderr: String },
}

pub struct StdinResource {
    events: Option<Receiver<LineEvent>>,
}

impl StdinResource {
    pub fn new() -> Self {
        Self { events: None }
    }

    fn start(&mut self) {
        if self.events.is_some() {
            return;
        }
        let (tx, rx) = mpsc::channel();
        thread::spawn(move || {
            let stdin = std::io::stdin();
            let mut reader = BufReader::new(stdin.lock());
            loop {
                let mut buf = Vec::new();
                match reader.read_until(b'\n', &mut buf) {
                    Ok(0) => {
                        let _ = tx.send(LineEvent::Eof);
                        break;
                    }
                    Ok(_) => {
                        let text = String::from_utf8_lossy(&buf).into_owned();
                        if tx.send(LineEvent::Line(text)).is_err() {
                            break;
                        }
                        if !buf.ends_with(b"\n") {
                            let _ = tx.send(LineEvent::Eof);
                            break;
                        }
                    }
                    Err(_) => {
                        let _ = tx.send(LineEvent::Eof);
                        break;
                    }
                }
            }
        });
        self.events = Some(rx);
    }

    pub fn read_line(&mut self, timeout: Duration) -> Result<String, ReadFail> {
        self.start();
        let rx = self.events.as_ref().expect("stdin reader");
        match recv(rx, timeout) {
            Ok(LineEvent::Line(line)) => {
                strip_line(&line).map_err(|_| ReadFail::Message("EOF before newline".to_string()))
            }
            Ok(LineEvent::Eof) => Err(ReadFail::Message("EOF before newline".to_string())),
            Err(RecvTimeoutError::Timeout) => Err(ReadFail::Timeout),
            Err(RecvTimeoutError::Disconnected) => {
                Err(ReadFail::Message("EOF before newline".to_string()))
            }
        }
    }
}

impl Default for StdinResource {
    fn default() -> Self {
        Self::new()
    }
}

struct StartedProc {
    pid: u32,
    stdin: ChildStdin,
    events: Receiver<ProcEvent>,
}

pub struct ProcessResource {
    command: String,
    started: Option<StartedProc>,
}

impl ProcessResource {
    pub fn new(command: impl Into<String>) -> Self {
        Self {
            command: command.into(),
            started: None,
        }
    }

    fn ensure(&mut self) -> Result<(), String> {
        if self.started.is_some() {
            return Ok(());
        }
        let mut child = Command::new("sh")
            .arg("-c")
            .arg(format!("stdbuf -oL {}", self.command))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .process_group(0)
            .spawn()
            .map_err(|err| err.to_string())?;
        let pid = child.id();
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "process stdin is missing".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "process stdout is missing".to_string())?;
        let mut stderr = child
            .stderr
            .take()
            .ok_or_else(|| "process stderr is missing".to_string())?;
        let (tx, rx) = mpsc::channel();
        let line_tx = tx.clone();
        thread::spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                let mut buf = Vec::new();
                match reader.read_until(b'\n', &mut buf) {
                    Ok(0) => {
                        let _ = line_tx.send(ProcEvent::Eof);
                        break;
                    }
                    Ok(_) => {
                        let text = String::from_utf8_lossy(&buf).into_owned();
                        if line_tx.send(ProcEvent::Line(text)).is_err() {
                            break;
                        }
                        if !buf.ends_with(b"\n") {
                            let _ = line_tx.send(ProcEvent::Eof);
                            break;
                        }
                    }
                    Err(_) => {
                        let _ = line_tx.send(ProcEvent::Eof);
                        break;
                    }
                }
            }
        });
        let (err_tx, err_rx) = mpsc::channel();
        thread::spawn(move || {
            let mut err_buf = Vec::new();
            let _ = stderr.read_to_end(&mut err_buf);
            let _ = err_tx.send(err_buf);
        });
        thread::spawn(move || {
            let status = child.wait();
            let code = status.ok().and_then(|status| status.code());
            let err_buf = err_rx.recv().unwrap_or_default();
            let stderr_text = String::from_utf8_lossy(&err_buf).into_owned();
            let _ = tx.send(ProcEvent::Exited {
                code,
                stderr: stderr_text,
            });
        });
        self.started = Some(StartedProc {
            pid,
            stdin,
            events: rx,
        });
        Ok(())
    }

    pub fn read_line(&mut self, timeout: Duration) -> Result<String, ReadFail> {
        self.ensure().map_err(ReadFail::Message)?;
        let started = self.started.as_ref().expect("process started");
        let deadline = Instant::now() + timeout.min(MAX_WAIT);
        read_proc_events(&started.events, deadline, None)
    }

    pub fn write(&mut self, content: &str) -> Result<(), String> {
        self.ensure()?;
        let started = self.started.as_mut().expect("process started");
        started
            .stdin
            .write_all(content.as_bytes())
            .map_err(|err| err.to_string())?;
        started.stdin.flush().map_err(|err| err.to_string())
    }

    pub fn cleanup(&mut self) {
        if let Some(started) = &self.started {
            kill_group(started.pid);
        }
    }
}

fn read_proc_events(
    events: &Receiver<ProcEvent>,
    deadline: Instant,
    mut exited: Option<(Option<i32>, String)>,
) -> Result<String, ReadFail> {
    loop {
        let now = Instant::now();
        if now >= deadline {
            return finish_wait(exited);
        }
        match recv(events, deadline.saturating_duration_since(now)) {
            Ok(ProcEvent::Line(line)) => {
                return strip_line(&line)
                    .map_err(|_| ReadFail::Message("EOF before newline".to_string()));
            }
            Ok(ProcEvent::Eof) => {
                if exited.is_none() {
                    let now = Instant::now();
                    if now < deadline {
                        if let Ok(ProcEvent::Exited { code, stderr }) =
                            recv(events, deadline.saturating_duration_since(now))
                        {
                            exited = Some((code, stderr));
                        }
                    }
                }
                return match exited {
                    Some((code, stderr)) => exit_error(code, &stderr),
                    None => Err(ReadFail::Message("EOF before newline".to_string())),
                };
            }
            Ok(ProcEvent::Exited { code, stderr }) => {
                exited = Some((code, stderr));
            }
            Err(RecvTimeoutError::Timeout) | Err(RecvTimeoutError::Disconnected) => {
                return finish_wait(exited);
            }
        }
    }
}

fn finish_wait(exited: Option<(Option<i32>, String)>) -> Result<String, ReadFail> {
    match exited {
        Some((code, stderr)) => exit_error(code, &stderr),
        None => Err(ReadFail::Timeout),
    }
}

fn exit_error(code: Option<i32>, stderr: &str) -> Result<String, ReadFail> {
    if code == Some(0) {
        return Err(ReadFail::Message("EOF before newline".to_string()));
    }
    let msg = stderr.trim();
    if msg.is_empty() {
        Err(ReadFail::Message(format!(
            "process exited {}",
            code.unwrap_or(-1)
        )))
    } else {
        Err(ReadFail::Message(msg.to_string()))
    }
}

fn recv<T>(rx: &Receiver<T>, timeout: Duration) -> Result<T, RecvTimeoutError> {
    rx.recv_timeout(timeout.min(MAX_WAIT))
}

fn strip_line(line: &str) -> Result<String, ()> {
    let Some(stripped) = line.strip_suffix('\n') else {
        return Err(());
    };
    Ok(stripped.strip_suffix('\r').unwrap_or(stripped).to_string())
}

fn kill_group(pid: u32) {
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    unsafe {
        kill(-(pid as i32), 9);
    }
}
