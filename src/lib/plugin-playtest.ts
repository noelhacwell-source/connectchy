/** Timed server-side checks inside a real Studio Play/Run session. */
export const PLUGIN_PLAYTEST = String.raw`
local playtestBusy = false
local playtestRunner
plugin.Unloading:Connect(function()
	if playtestRunner then playtestRunner:Destroy() end
end)
local function runPlaytest(p)
	if playtestBusy then error("A Connectchy playtest is already running", 0) end
	local mode = p.mode or "play"
	local duration = p.duration or 10
	if mode ~= "play" and mode ~= "run" then error("mode must be play or run", 0) end
	if type(duration) ~= "number" or duration < 1 or duration > 60 or duration % 1 ~= 0 then error("duration must be 1–60 whole seconds", 0) end
	if p.code ~= nil and (type(p.code) ~= "string" or #p.code > 32000) then error("code must be a string under 32 KB", 0) end
	local service = game:GetService("StudioTestService")
	if not service.EditModeActive then error("Stop the current Studio test before starting another", 0) end
	local nonce = HttpService:GenerateGUID(false)
	local runner = Instance.new("Script")
	runner.Name = "ConnectchyPlaytest_" .. nonce
	local source = [[
local service = game:GetService("StudioTestService")
local args = service:GetTestArgs()
if type(args) ~= "table" or args.connectchy ~= script.Name then return end
local logs, errors, finished = {}, 0, false
local started = os.clock()
local connection = game:GetService("LogService").MessageOut:Connect(function(message, kind)
 if #logs < 150 then logs[#logs+1] = {message=string.sub(message,1,1000),kind=tostring(kind)} end
 if kind == Enum.MessageType.MessageError then errors = errors + 1 end
end)
local function finish(result)
 if finished then return end
 finished = true
 connection:Disconnect()
 result.logs = logs
 result.runtimeErrors = errors
 result.elapsed = os.clock() - started
 service:EndTest(result)
end
task.delay(args.duration, function()
 finish({passed=not args.hasCode and errors==0, timedOut=args.hasCode, reason=args.hasCode and "Test checks exceeded their duration" or "Timed observation finished"})
end)
task.spawn(function()
 while not finished do
  task.wait(1)
  local ok, response = pcall(function()
   local url = args.server.."/api/plugin/control"
   if args.commandId then url = url.."?command="..tostring(args.commandId) end
   return game:GetService("HttpService"):RequestAsync({Url=url,Method="GET",Headers={["x-plugin-key"]=args.key}})
  end)
  if ok and response.Success then
   local decoded, control = pcall(function() return game:GetService("HttpService"):JSONDecode(response.Body) end)
   if decoded and control.paused then finish({passed=false,cancelled=true,reason="Stopped by owner"}) end
  end
 end
end)
if args.hasCode then
 task.spawn(function()
  local function checks()
__CONNECTCHY_CHECKS__
  end
  local ok, value = xpcall(checks, debug.traceback)
  finish({passed=ok and errors==0, value=ok and tostring(value) or nil, error=not ok and tostring(value) or nil})
 end)
end
]]
	source = string.gsub(source, "__CONNECTCHY_CHECKS__", function() return p.code or "" end)
	local compiled, syntaxError = loadstring(source)
	if not compiled then runner:Destroy() error("Playtest syntax error: " .. tostring(syntaxError), 0) end
	local written, writeError = pcall(function()
		ScriptEditorService:UpdateSourceAsync(runner, function() return source end)
	end)
	if not written then runner:Destroy() error("Cannot create test runner: " .. tostring(writeError), 0) end
	runner.Parent = game:GetService("ServerScriptService")
	playtestRunner = runner
	playtestBusy = true
	local active = true
	task.spawn(function()
		while active do
			pcall(function()
				HttpService:RequestAsync({Url=SERVER_URL.."/api/plugin/poll",Method="POST",Headers={["Content-Type"]="application/json",["x-plugin-key"]=PLUGIN_KEY},Body=HttpService:JSONEncode({version=PLUGIN_VERSION,noWait=true})})
			end)
			task.wait(3)
		end
	end)
	local args = {connectchy=runner.Name,duration=duration,hasCode=p.code~=nil and p.code~="",server=SERVER_URL,key=PLUGIN_KEY,commandId=p._commandId}
	local ok, result = pcall(function()
		if mode == "run" then return service:ExecuteRunModeAsync(args) end
		return service:ExecutePlayModeAsync(args)
	end)
	active = false
	playtestBusy = false
	runner:Destroy()
	playtestRunner = nil
	if not ok then error("Studio playtest failed: " .. tostring(result), 0) end
	if type(result) ~= "table" then return {passed=false,cancelled=true,reason="Test stopped manually or runner did not return a result",mode=mode} end
	result.mode = mode
	return result
end
`;
