import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
const host = process.env.TEST_ORIGIN || "http://127.0.0.1:3000";
async function call(url, body, headers = {}, status = 200) {
  const r = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  assert.equal(r.status, status, JSON.stringify(d));
  return d;
}
const questions = [
  { prompt: "Timing?", options: ["Today", "Tomorrow"] },
  { prompt: "Editor?", options: ["Studio", "Code"] },
];
let modelCalls = 0;
const provider = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const b = JSON.parse(Buffer.concat(chunks));
  assert.equal(req.url, "/v1/chat/completions");
  assert.equal(req.headers.authorization, "Bearer demo-key");
  assert.equal(b.model, "custom/model");
  const system = b.messages[0].content;
  let answer = "Model reply";
  if (system.includes("zero-based"))
    answer = JSON.stringify({ choices: [0, 1] });
  else if (system.includes('"questions"'))
    answer = JSON.stringify({ title: "Model survey", questions });
  else if (system.includes("the question"))
    answer = JSON.stringify({
      title: "What next?",
      description: "Provider context",
    });
  if (system.startsWith("You are") && system.includes("Create a private chat"))
    answer = JSON.stringify({ title: "Provider chat", members: [] });
  if (Array.isArray(b.messages[1].content)) {
    assert(b.messages[1].content.some((x) => x.type === "image_url"));
    answer = "Frames received";
  } else if (b.messages[1].content.includes("Clip caption and metadata:")) {
    assert(b.messages[1].content.includes("Updated clip caption"));
    answer = "Caption received as text";
  }
  assert(JSON.stringify(b.messages[1].content).includes("Current bridge status"));
  if(system.includes("Propose one editor command")) answer=JSON.stringify({type:"get_tree",payload:{depth:1}});
  modelCalls++;
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ choices: [{ message: { content: answer } }] }));
});
provider.listen(0, "127.0.0.1");
await once(provider, "listening");
const { token } = await call(
  host + "/api/connections",
  { name: "Disposable collaboration test" },
  {},
  201,
);
const base = host + "/api/agent/" + token,
  remote = { "cf-ray": "test" };
try {
  const room = (await call(base + "/rooms")).activeRoomId,
    url = base + "/studio?room=" + room;
  const a = await call(base + "/directory", {
    action: "import",
    name: "Atlas",
    model: "custom/model",
    provider: "http://127.0.0.1:" + provider.address().port + "/v1",
    apiKey: "demo-key",
  });
  const b = await call(base + "/directory", { action: "invite", name: "Mira" }),
    c = await call(base + "/directory", { action: "invite", name: "Observer" });
  const h = (k) => ({ ...remote, "x-agent-key": k.key });
  await call(url, null, remote, 403);
  await call(base + "/directory", null, h(b), 403);
  assert(!JSON.stringify(await call(base + "/directory")).includes("demo-key"));
  const privateId = (
    await call(
      url,
      {
        action: "create",
        kind: "private",
        title: "Side room",
        members: [a.id],
      },
      h(b),
    )
  ).topic.id;
  await call(
    url,
    { action: "post", id: privateId, text: "Private discussion" },
    h(b),
  );
  assert(!(await call(url, null, h(c))).topics.some((t) => t.id === privateId));
  await call(
    url,
    { action: "post", id: privateId, text: "Spoof", agent: "Mira" },
    h(c),
    404,
  );
  await call(url, { action: "post", id: privateId, text: "Owner here" });
  const ask = base + "/respond?room=" + room;
  await call(ask, {
    agentId: a.id,
    prompt: "Review the discussion",
    topicId: privateId,
  });
  const survey = (
    await call(ask, { agentId: a.id, prompt: "Make a survey", make: "survey" })
  ).topic;
  await Promise.all([
    call(url, { action: "vote", id: survey.id, choices: [1, 0] }, h(b)),
    call(ask, { agentId: a.id, prompt: "Vote", topicId: survey.id }),
  ]);
  let data = await call(url);
  assert.equal(
    Object.keys(data.topics.find((t) => t.id === survey.id).content.ballots)
      .length,
    2,
  );
  await call(url, { action: "withdraw", id: survey.id }, h(b));
  await call(url, { action: "close", id: survey.id, value: true });
  await call(
    url,
    { action: "vote", id: survey.id, choices: [0, 0] },
    h(b),
    409,
  );
  const q = (
    await call(ask, {
      agentId: a.id,
      prompt: "Ask a question",
      make: "question",
    })
  ).topic;
  const answer = (
    await call(url, { action: "post", id: q.id, text: "Answer" }, h(b))
  ).topic.content.posts[0];
  await call(url, {
    action: "accept",
    id: q.id,
    postId: answer.id,
    value: true,
  });
  await call(url, { action: "removePost", id: q.id, postId: answer.id }, h(b));
  assert.equal(
    (await call(url)).topics.find((t) => t.id === q.id).content.accepted,
    null,
  );
  await call(url, { action: "duplicate", id: survey.id }, h(b));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhrkAAAAASUVORK5CYII=","base64");
  const imageMeta = Buffer.from(JSON.stringify({mime:"image/png",name:"pixel.png",duration:0,times:[0],frames:["data:image/jpeg;base64,/9j/2Q=="],caption:"A pixel",size:png.length}));
  const imagePrefix = Buffer.alloc(4); imagePrefix.writeUInt32BE(imageMeta.length);
  const imageUpload = await fetch(base+"/videos?room="+room,{method:"POST",headers:{"content-type":"application/octet-stream"},body:Buffer.concat([imagePrefix,imageMeta,png])});
  assert.equal(imageUpload.status,201);
  const imageId = (await imageUpload.json()).message.id;
  const imageFile = await fetch(base+"/videos?id="+imageId);
  assert.equal(imageFile.headers.get("content-type"),"image/png");
  assert.deepEqual(Buffer.from(await imageFile.arrayBuffer()),png);
  assert((await call(base+"/records?kind=video")).records.some(r=>r.id===imageId && r.mime==="image/png"));
  const video = await call(
    base + "/videos?room=" + room,
    {
      mime: "video/mp4",
      name: "transport.mp4",
      duration: 1,
      caption: "Test sample",
      original: Buffer.from("0000ftypisom0000").toString("base64"),
      frames: ["data:image/jpeg;base64,/9j/2Q=="],
      times: [0.5],
    },
    h(b),
    201,
  );
  assert((await call(base+"/videos?room="+room)).clips.some(c=>c.id===video.message.id && c.name==="transport.mp4"));
  const {proposal}=await call(ask,{agentId:a.id,prompt:"Inspect the tree",make:"command"});
  assert.equal(proposal.agent,"Atlas");assert.equal(proposal.type,"get_tree");
  const pluginHeaders={"x-plugin-key":"pk_"+createHash("sha256").update("studio-link-plugin:"+token).digest("base64url")};
  const poll=body=>call(host+"/api/plugin/poll",{noWait:true,...body},pluginHeaders);
  await poll({});
  const queued=await call(base+"/command",{...proposal,wait:false},{},202);
  assert(queued.id);
  const dispatch=await poll({noWait:false});
  assert(JSON.stringify(dispatch).includes("get_tree"));
  await poll({results:[{id:queued.id,ok:true,json:JSON.stringify({value:{name:"Workspace"}})}]});
  const media = base + "/videos?id=" + video.message.id;
  const range = await fetch(media, { headers: { Range: "bytes=4-7" } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), "ftyp");
  assert.equal((await call(media + "&frames=1")).frames.length, 1);
  assert.equal(
    (
      await call(ask, {
        agentId: a.id,
        videoId: video.message.id,
        prompt: "Describe the clip",
      })
    ).message.text,
    "Frames received",
  );
  const editClip = await fetch(media, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Transport clip",
      caption: "Updated clip caption",
    }),
  });
  assert.equal(editClip.status, 200);
  assert.equal(
    (
      await call(ask, {
        agentId: a.id,
        videoId: video.message.id,
        videoInput: "caption",
        prompt: "Explain the description",
      })
    ).message.text,
    "Caption received as text",
  );

  async function setVideoLimit(limitMb, headers = {}) {
    return fetch(base + "/video-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ limitMb }),
    });
  }
  assert.equal((await setVideoLimit(null, remote)).status, 403);
  assert.equal((await setVideoLimit(1)).status, 200);
  const clipBytes = Buffer.alloc(1_000_001);
  clipBytes.writeUInt32BE(0x1a45dfa3);
  const clipMeta = Buffer.from(
    JSON.stringify({
      size: clipBytes.length,
      mime: "video/webm",
      name: "Limit check.webm",
      duration: 1,
      caption: "",
      frames: ["data:image/jpeg;base64,/9j/2Q=="],
      times: [0.5],
    }),
  );
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32BE(clipMeta.length);
  const streamBody = Buffer.concat([prefix, clipMeta, clipBytes]);
  const upload = () =>
    fetch(base + "/videos", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: streamBody,
    });
  assert.equal((await upload()).status, 413);
  const unlimited = await setVideoLimit(null);
  assert.equal(unlimited.status, 200);
  assert.equal((await unlimited.json()).limitMb, null);
  const streamed = await upload();
  assert.equal(streamed.status, 201);
  const streamedUrl = base + "/videos?id=" + (await streamed.json()).message.id;
  const download = await fetch(streamedUrl, { headers: { Range: "bytes=-1" } });
  assert.equal(
    download.headers.get("content-range"),
    "bytes 1000000-1000000/1000001",
  );
  await download.arrayBuffer();
  assert.equal((await setVideoLimit(500)).status, 200);
  await call(
    base + "/cleanup",
    { kind: "message", id: video.message.id },
    h(b),
  );
  await call(media, null, {}, 404);
  const task = (
    await call(base + "/workspace?room=" + room, {
      action: "create",
      entry: { kind: "task", title: "Disposable task" },
    })
  ).entry;
  const dependent = (
    await call(base + "/workspace?room=" + room, {
      action: "create",
      entry: {
        kind: "task",
        title: "Dependent",
        data: { dependencies: [task.id] },
      },
    })
  ).entry;
  await call(base + "/cleanup", { kind: "task", id: task.id }, h(b));
  assert.deepEqual(
    (await call(base + "/workspace?kind=task&id=" + dependent.id)).entries[0]
      .data.dependencies,
    [],
  );
  assert(
    !(await call(base + "/workspace?kind=task")).entries.some(
      (t) => t.id === task.id,
    ),
  );
  await call(url, { action: "delete", id: privateId }, h(a));
  await call(url, { action: "post", id: privateId, text: "Gone" }, h(b), 404);
  const old = await call(base + "/rooms", {
    action: "create",
    name: "Archived room",
  });
  await call(base + "/rooms", { action: "delete", id: old.room.id });
  await call(base + "/rooms", { action: "purge", id: old.room.id }, h(b));
  assert(
    !(await call(base + "/rooms?archived=1")).rooms.some(
      (r) => r.id === old.room.id,
    ),
  );
  const rotated = await call(base + "/directory", {
    action: "rotate",
    id: b.id,
  });
  await call(url, null, h(b), 403);
  await call(url, null, h(rotated));
  const last = await call(
    base + "/rooms",
    { action: "purge", id: room },
    h(rotated),
  );
  assert.notEqual(last.activeRoomId, room);
  assert.equal(
    (await call(base + "/studio?room=" + last.activeRoomId)).topics.length,
    0,
  );
  await call(
    base + "/cards?tab=catalog",
    { action: "hide", key: "1" },
    h(rotated),
  );
  assert((await call(base + "/cards?tab=catalog")).hidden.includes("1"));
  await call(base + "/cards?tab=catalog", { action: "restore", key: "1" });
  assert(!(await call(base + "/cards?tab=catalog")).hidden.length);
  const generatedPrivate = await call(
    base + "/respond?room=" + last.activeRoomId,
    {
      agentId: a.id,
      prompt: "Open a private chat with the owner",
      make: "private",
    },
  );
  assert.equal(generatedPrivate.topic.kind, "private");
  assert.deepEqual(generatedPrivate.topic.members, [a.id]);
  assert.equal(modelCalls, 8);
  console.log(
    "Passed individual access, private threads, owner oversight, model replies, multi-question voting, Q&A, media transport and vision payloads, cleanup, key rotation and room cascades.",
  );
} finally {
  await fetch(base, { method: "DELETE" });
  provider.close();
}
