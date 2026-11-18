import assert from "node:assert/strict";

const host = process.env.TEST_ORIGIN || "http://127.0.0.1:3000";
async function request(path, { method = "GET", body, key, status = 200 } = {}) {
  const response = await fetch(host + path, {
    method,
    headers: { "Content-Type": "application/json", ...(key ? { "x-agent-key": key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  return data;
}

const projects = [];
async function createProject(mode) {
  const { token } = await request("/api/connections", { method: "POST", status: 201, body: { name: "Disposable record test", mode } });
  const path = "/api/agent/" + token;
  projects.push(path);
  return path;
}

try {
  const first = await createProject("vscode");
  const other = await createProject("roblox");
  const { activeRoomId } = await request(first + "/rooms");
  const { key: member, id: memberId } = await request(first + "/directory", { method: "POST", body: { action: "invite", name: "Member" } });
  const { key: guest } = await request(first + "/directory", { method: "POST", body: { action: "invite", name: "Guest" } });
  const { topic } = await request(first + "/studio", { method: "POST", body: { action: "create", kind: "private", title: "Private test", members: [memberId] } });
  const privateList = first + "/records?kind=private";
  assert.equal((await request(privateList, { key: member })).records[0]?.id, topic.id);
  assert.equal((await request(privateList, { key: guest })).records.length, 0);
  assert.equal((await request(privateList, { key: guest, method: "DELETE", body: { mode: "all" } })).count, 0);
  assert.equal((await request(privateList, { key: member, method: "DELETE", body: { mode: "selected", ids: [topic.id] } })).count, 1);
  await request(other + "/records?kind=private", { key: member, status: 403 });

  const noteList = first + "/records?kind=note&room=" + activeRoomId;
  const notes = [];
  for (const title of ["First note", "Second note"]) {
    const { entry } = await request(first + "/workspace?room=" + activeRoomId, { method: "POST", body: { action: "create", entry: { kind: "note", title } } });
    notes.push(entry.id);
  }
  assert.equal((await request(noteList, { key: member })).records.length, 2);
  assert.equal((await request(noteList, { key: member, method: "DELETE", body: { mode: "selected", ids: [notes[1]] } })).count, 1);
  assert.equal((await request(noteList)).records[0]?.id, notes[0]);
  const { room: secondRoom } = await request(first + "/rooms", { method: "POST", body: { action: "create", name: "Another room" } });
  await request(first + "/workspace?room=" + secondRoom.id, { method: "POST", body: { action: "create", entry: { kind: "note", title: "Keep me" } } });
  assert.equal((await request(noteList, { key: member, method: "DELETE", body: { mode: "all" } })).count, 1);
  assert.equal((await request(first + "/records?kind=note&room=" + secondRoom.id)).records.length, 1);

  const cards = first + "/cards?tab=insights";
  await request(cards, { key: member, method: "POST", body: { action: "hide", all: true } });
  assert((await request(cards)).hidden.length > 1);
  await request(cards, { method: "POST", body: { action: "restore", all: true } });
  assert.equal((await request(cards)).hidden.length, 0);

  const roomList = first + "/records?kind=room";
  assert.equal((await request(roomList)).records.length, 2);
  assert.equal((await request(roomList, { key: member, method: "DELETE", body: { mode: "all" } })).count, 2);
  const result = await request(first + "/rooms");
  assert.equal(result.rooms.length, 1);
  assert.notEqual(result.activeRoomId, secondRoom.id);

  console.log("Passed selected and full-collection removal, room and project isolation, private membership, display-card bulk restore, and room replacement.");
} finally {
  for (const path of projects) await request(path, { method: "DELETE" });
}

