"use strict";

const conditions = {full: "전체 지시문", subtask: "단계별 지시문"};
const colorNames = {red: "빨강", blue: "파랑", green: "초록", yellow: "노랑"};
const outcomeNames = {
  success: "성공",
  timeout: "시간 초과",
  object_dropped: "물체 떨어짐",
  excluded_object_in_bowl: "제외 물체가 그릇에 들어감",
  excluded_in_bowl: "제외 물체가 그릇에 들어감",
};
const byId = (id) => document.getElementById(id);

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function scored(run) {
  return Boolean(run?.outcome && !run.inference_error);
}

function outcome(run) {
  if (!run) return "평가 대기";
  if (run.inference_error) return "추론 오류";
  return outcomeNames[run.outcome] ?? run.outcome ?? "평가 대기";
}

function details(run) {
  const parts = [outcome(run)];
  if (Number.isFinite(run?.placed)) parts.push(`${run.placed}/3개 배치`);
  if (Number.isFinite(run?.elapsed_seconds)) parts.push(`${run.elapsed_seconds.toFixed(1)}초`);
  return parts.join(" · ");
}

function videoPath(path) {
  if (typeof path !== "string") return null;
  if (!/^(?:\.\/)?[\w./-]+\.mp4$/i.test(path) || path.startsWith("/") || path.split("/").includes("..")) return null;
  return path.startsWith("./") ? path : `./${path}`;
}

function clip(condition, run) {
  const card = element("article", undefined, "clip");
  const header = element("header");
  header.append(element("h3", conditions[condition]), element("span", outcome(run), "chip"));
  const film = element("div", undefined, "film");
  const path = videoPath(run?.video);
  if (path) {
    const video = element("video");
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = path;
    video.setAttribute("aria-label", `${conditions[condition]} 롤아웃 영상`);
    video.addEventListener("error", () => film.replaceChildren(element("p", "영상 파일을 열 수 없습니다.")));
    film.append(video);
  } else {
    film.append(element("p", "영상 대기 중"));
  }
  card.append(header, film, element("p", details(run)));
  return card;
}

function render(data) {
  if (!Array.isArray(data.runs) || !Number.isInteger(data.planned_pairs) || data.planned_pairs < 1) {
    throw new Error("Invalid evaluation result file");
  }

  const grouped = new Map();
  for (const run of data.runs) {
    if (!Number.isInteger(run.seed) || !Object.hasOwn(conditions, run.condition)) continue;
    if (!grouped.has(run.seed)) grouped.set(run.seed, {seed: run.seed, excluded: run.excluded});
    grouped.get(run.seed)[run.condition] = run;
  }
  const pairs = [...grouped.values()].sort((a, b) => a.seed - b.seed);
  const complete = pairs.filter((pair) => scored(pair.full) && scored(pair.subtask));
  const counts = Object.keys(conditions).map((condition) => {
    const runs = pairs.map((pair) => pair[condition]).filter(scored);
    const successes = runs.filter((run) => run.outcome === "success").length;
    byId(`${condition}-count`).textContent = runs.length ? `${successes} / ${runs.length}` : "—";
    return runs.length;
  });
  byId("pair-count").textContent = `${complete.length} / ${data.planned_pairs}`;
  byId("status").textContent = complete.length === data.planned_pairs ? "평가 완료" : "평가 결과 수집 중";
  byId("result-note").textContent = `집계 대상 ${counts[0] + counts[1]} / ${2 * data.planned_pairs}회. 추론 오류는 표에 별도로 표시합니다.`;
  const fullOnly = complete.filter((pair) => pair.full.outcome === "success" && pair.subtask.outcome !== "success").length;
  const subtaskOnly = complete.filter((pair) => pair.subtask.outcome === "success" && pair.full.outcome !== "success").length;
  byId("pair-note").textContent = complete.length
    ? `완료된 ${complete.length}개 시드 쌍에서 전체 지시문만 성공 ${fullOnly}회 · 단계별 지시문만 성공 ${subtaskOnly}회`
    : "두 조건의 결과가 모두 저장되면 시드별 비교를 표시합니다.";

  const rows = pairs.map((pair) => {
    const row = element("tr");
    for (const value of [pair.seed, colorNames[pair.excluded] ?? pair.excluded ?? "—", details(pair.full), details(pair.subtask)]) {
      row.append(element("td", value));
    }
    return row;
  });
  if (rows.length) byId("rows").replaceChildren(...rows);

  const available = pairs.filter((pair) => videoPath(pair.full?.video) || videoPath(pair.subtask?.video));
  if (!available.length) return;
  const select = byId("seed");
  select.replaceChildren(...available.map((pair) => {
    const option = element("option", `${pair.seed} · ${colorNames[pair.excluded] ?? pair.excluded ?? "—"} 제외`);
    option.value = String(pair.seed);
    return option;
  }));
  select.disabled = false;
  const firstPaired = available.find((pair) => videoPath(pair.full?.video) && videoPath(pair.subtask?.video));
  if (firstPaired) select.value = String(firstPaired.seed);
  function show() {
    const pair = grouped.get(Number(select.value));
    byId("clips").replaceChildren(clip("full", pair.full), clip("subtask", pair.subtask));
    const color = colorNames[pair.excluded] ?? pair.excluded ?? "—";
    byId("case-caption").textContent = `시드 ${pair.seed} · ${color} 제외. 영상에는 현재 지시문, 배치한 블록 수, 시뮬레이션 시간이 표시됩니다.`;
  }
  select.onchange = show;
  show();
}

fetch("./results.json", {cache: "no-cache"})
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(render)
  .catch(() => {
    byId("status").textContent = "결과 파일 대기 중";
    byId("result-note").textContent = "평가 결과 파일을 사용할 수 없습니다. 정적 서버에서 페이지를 열고 results.json이 같은 경로에 있는지 확인하세요.";
  });
