/** Connectchy plugin, part 2: command handlers, polling loop, status panel. Plain Lua 5.1 syntax. */
export const PLUGIN_HANDLERS = String.raw`
---------------------------------------------------------------- commands
local handlers = {}

local function describe(inst)
	return { path = pathOf(inst), name = inst.Name, className = inst.ClassName }
end

local function scanAll(under, visit)
	local roots = {}
	if type(under) == "string" and under ~= "" then
		roots[1] = resolve(under)
	else
		for _, name in ipairs(ROOT_SERVICES) do
			local ok, service = pcall(function()
				return game:GetService(name)
			end)
			if ok and service then
				roots[#roots + 1] = service
			end
		end
	end
	for _, root in ipairs(roots) do
		for _, inst in ipairs(root:GetDescendants()) do
			if visit(inst) then
				return
			end
		end
	end
end

local function createFromSpec(spec, parent, errors, label)
	if type(spec) ~= "table" or type(spec.className) ~= "string" then
		error("className is required for every instance", 0)
	end
	local ok, inst = pcall(Instance.new, spec.className)
	if not ok then
		error("'" .. spec.className .. "' is not a creatable Roblox class", 0)
	end
	if spec.name ~= nil then
		inst.Name = tostring(spec.name)
	end
	for _, message in ipairs(setProps(inst, spec.properties)) do
		errors[#errors + 1] = label .. inst.Name .. "." .. message
	end
	if type(spec.source) == "string" and inst:IsA("LuaSourceContainer") then
		inst.Source = spec.source
	end
	inst.Parent = parent
	if type(spec.children) == "table" then
		for _, childSpec in ipairs(spec.children) do
			createFromSpec(childSpec, inst, errors, label .. inst.Name .. "/")
		end
	end
	return inst
end

handlers.get_tree = function(p)
	local depth = math.clamp(tonumber(p.depth) or 2, 0, 12)
	local budget = { left = 2000 }
	if type(p.path) == "string" and p.path ~= "" and p.path ~= "game" then
		local inst = resolve(p.path)
		return buildTree(inst, pathOf(inst), depth, budget)
	end
	local roots = {}
	for _, name in ipairs(ROOT_SERVICES) do
		local ok, service = pcall(function()
			return game:GetService(name)
		end)
		if ok and service then
			roots[#roots + 1] = buildTree(service, service.Name, depth - 1, budget)
		end
	end
	return { name = game.Name, className = "DataModel", path = "game", childCount = #roots, children = roots }
end

handlers.get_instance = function(p)
	local inst = resolve(p.path)
	local props = {}
	for _, name in ipairs(PROPERTY_NAMES) do
		local ok, value = pcall(function()
			return inst[name]
		end)
		if ok and value ~= nil then
			props[name] = ser(value)
		end
	end
	local all = inst:GetChildren()
	local children = {}
	for i, child in ipairs(all) do
		if i > 200 then
			break
		end
		children[i] = { name = child.Name, className = child.ClassName }
	end
	local info = describe(inst)
	info.properties = props
	info.attributes = ser(inst:GetAttributes())
	info.tags = CollectionService:GetTags(inst)
	info.children = children
	info.childCount = #all
	if inst:IsA("LuaSourceContainer") then
		info.source = getSource(inst)
	end
	return info
end

handlers.find = function(p)
	local limit = math.clamp(tonumber(p.limit) or 100, 1, 500)
	local query = p.query and string.lower(tostring(p.query)) or nil
	local results = {}
	scanAll(p.under, function(inst)
		local classOk = true
		if p.className then
			local okIsA, isA = pcall(function()
				return inst:IsA(p.className)
			end)
			classOk = okIsA and isA
		end
		if classOk and (not query or string.find(string.lower(inst.Name), query, 1, true)) then
			results[#results + 1] = describe(inst)
		end
		return #results >= limit
	end)
	return { count = #results, limited = #results >= limit, results = results }
end

handlers.list_scripts = function(p)
	local scripts = {}
	scanAll(p.under, function(inst)
		if inst:IsA("LuaSourceContainer") then
			local entry = describe(inst)
			local ok, source = pcall(getSource, inst)
			entry.lines = ok and lineCount(source) or 0
			scripts[#scripts + 1] = entry
		end
		return #scripts >= 1000
	end)
	return { count = #scripts, scripts = scripts }
end

handlers.search_scripts = function(p)
	if type(p.text) ~= "string" or p.text == "" then
		error("text is required", 0)
	end
	local limit = math.clamp(tonumber(p.limit) or 100, 1, 500)
	local matches = {}
	scanAll(p.under, function(inst)
		if inst:IsA("LuaSourceContainer") then
			local ok, source = pcall(getSource, inst)
			if ok then
				local lineNo = 0
				for line in string.gmatch(source .. "\n", "(.-)\n") do
					lineNo = lineNo + 1
					if string.find(line, p.text, 1, true) then
						matches[#matches + 1] = { path = pathOf(inst), line = lineNo, text = string.sub(line, 1, 200) }
						if #matches >= limit then
							return true
						end
					end
				end
			end
		end
		return false
	end)
	return { count = #matches, matches = matches }
end

handlers.get_selection = function()
	local selected = {}
	for _, inst in ipairs(Selection:Get()) do
		selected[#selected + 1] = describe(inst)
	end
	return { selection = selected }
end

handlers.set_selection = function(p)
	local list = {}
	for _, path in ipairs(p.paths or {}) do
		list[#list + 1] = resolve(path)
	end
	Selection:Set(list)
	return { selected = #list }
end

handlers.create_instance = function(p)
	local parent = resolve(p.parent)
	local errors = {}
	local inst = createFromSpec(p, parent, errors, "")
	if #errors > 0 then
		inst:Destroy()
		error("Nothing was created because some properties failed: " .. table.concat(errors, "; "), 0)
	end
	return describe(inst)
end

handlers.set_properties = function(p)
	local inst = resolve(p.path)
	if type(p.properties) ~= "table" then
		error("properties object is required", 0)
	end
	local errors = setProps(inst, p.properties)
	if #errors > 0 then
		error("Some properties failed (the others were applied): " .. table.concat(errors, "; "), 0)
	end
	return describe(inst)
end

handlers.rename = function(p)
	local inst = resolve(p.path)
	if type(p.name) ~= "string" or p.name == "" then
		error("name is required", 0)
	end
	inst.Name = p.name
	return describe(inst)
end

handlers.move = function(p)
	local inst = resolve(p.path)
	inst.Parent = resolve(p.parent)
	return describe(inst)
end

handlers.clone = function(p)
	local inst = resolve(p.path)
	local copy = inst:Clone()
	if not copy then
		error(pathOf(inst) .. " cannot be cloned (Archivable is false)", 0)
	end
	if p.name ~= nil then
		copy.Name = tostring(p.name)
	end
	local errors = setProps(copy, p.properties)
	if #errors > 0 then
		copy:Destroy()
		error("Clone cancelled because some properties failed: " .. table.concat(errors, "; "), 0)
	end
	copy.Parent = p.parent and resolve(p.parent) or inst.Parent
	return describe(copy)
end

handlers.delete = function(p)
	local inst = resolve(p.path)
	if inst == game or inst.Parent == game then
		error("Refusing to delete a service. Delete its children instead.", 0)
	end
	local removed = describe(inst)
	-- Parent = nil instead of Destroy so that Studio's undo can bring it back.
	inst.Parent = nil
	return { deleted = removed }
end

handlers.create_script = function(p)
	local className = p.scriptType or "Script"
	if className ~= "Script" and className ~= "LocalScript" and className ~= "ModuleScript" then
		error("scriptType must be Script, LocalScript or ModuleScript", 0)
	end
	local parent = resolve(p.parent)
	local inst = Instance.new(className)
	inst.Name = tostring(p.name or className)
	inst.Source = tostring(p.source or "")
	inst.Parent = parent
	local out = describe(inst)
	out.lines = lineCount(inst.Source)
	return out
end

handlers.get_source = function(p)
	local inst = requireScript(p.path)
	local source = getSource(inst)
	return { path = pathOf(inst), className = inst.ClassName, lines = lineCount(source), source = source }
end

handlers.set_source = function(p)
	local inst = requireScript(p.path)
	if type(p.source) ~= "string" then
		error("source is required", 0)
	end
	setSource(inst, p.source)
	return { path = pathOf(inst), lines = lineCount(p.source) }
end

handlers.append_source = function(p)
	local inst = requireScript(p.path)
	if type(p.source) ~= "string" then
		error("source is required", 0)
	end
	local combined = getSource(inst) .. p.source
	setSource(inst, combined)
	return { path = pathOf(inst), lines = lineCount(combined) }
end

handlers.search_assets = function(p)
	if type(p.query) ~= "string" or p.query == "" then
		error("query is required", 0)
	end
	local kind = (p.kind == "decals") and "decals" or "models"
	local ok, pages = pcall(function()
		if kind == "decals" then
			return InsertService:GetFreeDecals(p.query, 0)
		end
		return InsertService:GetFreeModels(p.query, 0)
	end)
	if not ok then
		error("Creator Store search failed: " .. tostring(pages), 0)
	end
	local results = {}
	local list = (type(pages) == "table" and pages[1] and pages[1].Results) or {}
	for i, item in ipairs(list) do
		if i > 20 then
			break
		end
		results[i] = { assetId = item.AssetId, name = item.Name, creator = item.CreatorName }
	end
	return { kind = kind, count = #results, results = results }
end

local function loadAsset(assetId)
	local id = tonumber(assetId)
	if not id then
		error("assetId must be a number", 0)
	end
	local ok, objects = pcall(function()
		return game:GetObjects("rbxassetid://" .. id)
	end)
	if ok and type(objects) == "table" and #objects > 0 then
		return objects
	end
	local okLoad, container = pcall(function()
		return InsertService:LoadAsset(id)
	end)
	if not okLoad then
		error("Could not load asset " .. id .. ": " .. tostring(container), 0)
	end
	return container:GetChildren()
end

handlers.insert_asset = function(p)
	local parent = p.parent and resolve(p.parent) or workspace
	local objects = loadAsset(p.assetId)
	local first = objects[1]
	if first and p.name ~= nil then
		first.Name = tostring(p.name)
	end
	if first and type(p.position) == "table" and first:IsA("PVInstance") then
		first:PivotTo(CFrame.new(p.position[1], p.position[2], p.position[3]))
	end
	local inserted = {}
	for _, obj in ipairs(objects) do
		obj.Parent = parent
		inserted[#inserted + 1] = describe(obj)
	end
	return { inserted = inserted }
end

handlers.image_from_decal = function(p)
	local objects = loadAsset(p.assetId)
	for _, obj in ipairs(objects) do
		local decal = obj:IsA("Decal") and obj or obj:FindFirstChildWhichIsA("Decal", true)
		if decal then
			return { image = decal.Texture }
		end
	end
	error("Asset " .. tostring(p.assetId) .. " does not contain a decal", 0)
end

handlers.run_luau = function(p)
	if type(p.code) ~= "string" then
		error("code is required", 0)
	end
	if type(loadstring) ~= "function" then
		error("loadstring is not available to plugins in this Studio version", 0)
	end
	local fn, compileError = loadstring(p.code, "=StudioLink")
	if not fn then
		error("Syntax error: " .. tostring(compileError), 0)
	end
	local lines = {}
	local function capture(...)
		local parts = {}
		for i = 1, select("#", ...) do
			parts[i] = tostring((select(i, ...)))
		end
		lines[#lines + 1] = table.concat(parts, " ")
	end
	setfenv(fn, setmetatable({ print = capture, warn = capture, plugin = plugin }, { __index = getfenv(fn) }))
	local packed = table.pack(pcall(fn))
	local output = table.concat(lines, "\n")
	if not packed[1] then
		local message = "Runtime error: " .. tostring(packed[2])
		if output ~= "" then
			message = message .. "\nOutput before the error:\n" .. output
		end
		error(message, 0)
	end
	local returns = {}
	for i = 2, packed.n do
		local value = ser(packed[i])
		if value == nil then
			value = "nil"
		end
		returns[i - 1] = value
	end
	return { returns = returns, output = output }
end

handlers.undo = function()
	ChangeHistoryService:Undo()
	return { undone = true }
end

handlers.redo = function()
	ChangeHistoryService:Redo()
	return { redone = true }
end

handlers.batch = function(p)
	if type(p.commands) ~= "table" then
		error("commands array is required", 0)
	end
	local stopOnError = p.stopOnError ~= false
	local results = {}
	local failed = 0
	for i, cmd in ipairs(p.commands) do
		local handler = type(cmd) == "table" and cmd.type ~= "batch" and handlers[cmd.type] or nil
		local ok, res
		if handler then
			ok, res = pcall(handler, type(cmd.payload) == "table" and cmd.payload or {})
		else
			ok, res = false, "Unknown command type '" .. tostring(type(cmd) == "table" and cmd.type or cmd) .. "'"
		end
		if ok then
			results[i] = { ok = true, result = res }
		else
			failed = failed + 1
			results[i] = { ok = false, error = tostring(res) }
			if stopOnError then
				break
			end
		end
	end
	return { allOk = failed == 0, total = #p.commands, ran = #results, failed = failed, results = results }
end

local READ_ONLY = {
	get_tree = true, get_instance = true, find = true, list_scripts = true, search_scripts = true,
	get_selection = true, set_selection = true, get_source = true, search_assets = true,
	image_from_decal = true, undo = true, redo = true,
}

local function execute(cmd)
	local handler = handlers[cmd.type]
	if not handler then
		return false, "Unknown command type '" .. tostring(cmd.type) .. "'"
	end
	local payload = type(cmd.payload) == "table" and cmd.payload or {}
	if READ_ONLY[cmd.type] then
		return pcall(handler, payload)
	end
	-- Every change becomes one undo step in Studio.
	local label = "Connectchy: " .. cmd.type
	local recording
	pcall(function()
		recording = ChangeHistoryService:TryBeginRecording(label)
	end)
	local ok, res = pcall(handler, payload)
	if recording then
		pcall(function()
			ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
		end)
	else
		pcall(function()
			ChangeHistoryService:SetWaypoint(label)
		end)
	end
	return ok, res
end

---------------------------------------------------------------- status panel
local state = { enabled = true, online = false, message = "Connecting...", done = 0, log = {} }

local toolbar = plugin:CreateToolbar("Connectchy")
local toolbarButton = toolbar:CreateButton("Connectchy", "Show the Connectchy connection panel", "")
local widget = plugin:CreateDockWidgetPluginGui(
	"StudioLinkPanel",
	DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Float, true, false, 400, 480, 320, 370)
)
widget.Title = "Connectchy"

local panel = Instance.new("Frame")
panel.Size = UDim2.new(1, 0, 1, 0)
panel.BackgroundColor3 = Color3.fromRGB(24, 26, 31)
panel.BorderSizePixel = 0
panel.Parent = widget

local function makeLabel(y, height, textSize, font)
	local label = Instance.new("TextLabel")
	label.BackgroundTransparency = 1
	label.Position = UDim2.new(0, 12, 0, y)
	label.Size = UDim2.new(1, -24, 0, height)
	label.Font = font
	label.TextSize = textSize
	label.TextColor3 = Color3.fromRGB(226, 228, 233)
	label.TextXAlignment = Enum.TextXAlignment.Left
	label.TextYAlignment = Enum.TextYAlignment.Top
	label.TextWrapped = true
	label.Text = ""
	label.Parent = panel
	return label
end

local statusLabel = makeLabel(12, 22, 18, Enum.Font.GothamBold)
local detailLabel = makeLabel(38, 34, 12, Enum.Font.Gotham)
detailLabel.TextColor3 = Color3.fromRGB(150, 155, 166)
local addressLabel = makeLabel(116, 18, 12, Enum.Font.Gotham)
addressLabel.Text = "App address (saved on this computer)"
local addressBox = Instance.new("TextBox")
addressBox.Position = UDim2.new(0, 12, 0, 138)
addressBox.Size = UDim2.new(1, -24, 0, 30)
addressBox.BackgroundColor3 = Color3.fromRGB(35, 39, 46)
addressBox.TextColor3 = Color3.fromRGB(230, 232, 238)
addressBox.Font = Enum.Font.Code
addressBox.TextSize = 12
addressBox.ClearTextOnFocus = false
addressBox.Text = SERVER_URL
addressBox.Parent = panel
local saveAddress = Instance.new("TextButton")
saveAddress.Position = UDim2.new(0, 12, 0, 242)
saveAddress.Size = UDim2.new(1, -24, 0, 28)
saveAddress.BackgroundColor3 = Color3.fromRGB(45, 49, 58)
saveAddress.TextColor3 = Color3.fromRGB(240, 240, 245)
saveAddress.Font = Enum.Font.GothamMedium
saveAddress.TextSize = 12
saveAddress.Text = "Save / pair and reconnect"
saveAddress.Parent = panel
local pairLabel = makeLabel(176, 18, 12, Enum.Font.Gotham)
pairLabel.Text = "New project? Paste its AI link (optional)"
local pairBox = Instance.new("TextBox")
pairBox.Position = UDim2.new(0, 12, 0, 198)
pairBox.Size = UDim2.new(1, -24, 0, 30)
pairBox.BackgroundColor3 = Color3.fromRGB(35, 39, 46)
pairBox.TextColor3 = Color3.fromRGB(230, 232, 238)
pairBox.Font = Enum.Font.Code
pairBox.TextSize = 12
pairBox.ClearTextOnFocus = false
pairBox.Text = ""
pairBox.PlaceholderText = "Paste the private AI link here"
pairBox.Parent = panel
local logLabel = makeLabel(284, 400, 12, Enum.Font.Code)
logLabel.TextColor3 = Color3.fromRGB(170, 176, 188)

local toggle = Instance.new("TextButton")
toggle.Position = UDim2.new(0, 12, 0, 78)
toggle.Size = UDim2.new(0, 150, 0, 28)
toggle.BackgroundColor3 = Color3.fromRGB(45, 49, 58)
toggle.BorderSizePixel = 0
toggle.Font = Enum.Font.GothamMedium
toggle.TextSize = 13
toggle.TextColor3 = Color3.fromRGB(240, 240, 245)
toggle.Parent = panel

local function refreshUi()
	if state.stopped then
        statusLabel.Text = "STOPPED"
        statusLabel.TextColor3 = Color3.fromRGB(240, 140, 140)
        detailLabel.Text = "Stopped by the owner. Waiting for resume in the app."
    elseif not state.enabled then
		statusLabel.Text = "PAUSED"
		statusLabel.TextColor3 = Color3.fromRGB(245, 184, 61)
		detailLabel.Text = "Commands are not being accepted."
	elseif state.online then
		statusLabel.Text = "CONNECTED"
		statusLabel.TextColor3 = Color3.fromRGB(86, 211, 140)
		detailLabel.Text = "Listening for commands. " .. state.done .. " run this session."
	else
		statusLabel.Text = "OFFLINE"
		statusLabel.TextColor3 = Color3.fromRGB(240, 110, 100)
		detailLabel.Text = state.message
	end
	toggle.Text = state.enabled and "Pause connection" or "Resume connection"
	logLabel.Text = table.concat(state.log, "\n")
end

local function logLine(text)
	table.insert(state.log, 1, os.date("%H:%M:%S") .. "  " .. text)
	while #state.log > 14 do
		table.remove(state.log)
	end
	refreshUi()
end

toggle.MouseButton1Click:Connect(function()
	state.enabled = not state.enabled
	state.online = false
	state.message = "Connecting..."
	refreshUi()
end)
toolbarButton.Click:Connect(function()
	widget.Enabled = not widget.Enabled
end)
local savingAddress = false
saveAddress.MouseButton1Click:Connect(function()
	if savingAddress then return end
	local address = validServerAddress(addressBox.Text)
	if not address then
		state.message = "Enter an http:// or https:// address without a path."
		state.online = false
		refreshUi()
		return
	end
	local newKey = PLUGIN_KEY
	if pairBox.Text ~= "" then
		local token = string.match(pairBox.Text, "(sl_[%w_%-]+)")
		if not token then
			state.message = "Paste the private AI link from your project's Setup tab."
			state.online = false
			refreshUi()
			return
		end
		savingAddress = true
		local paired, response = pcall(function()
			return HttpService:RequestAsync({ Url = address .. "/api/plugin/pair", Method = "POST",
				Headers = { ["Content-Type"] = "application/json" }, Body = HttpService:JSONEncode({ token = token }) })
		end)
		savingAddress = false
		local decoded, result = pcall(function() return HttpService:JSONDecode(response.Body) end)
		if not paired or not decoded or not response.Success or type(result) ~= "table" or type(result.key) ~= "string" then
			state.message = "Pairing failed. Use the local app address and an existing project's AI link."
			state.online = false
			refreshUi()
			return
		end
		newKey = result.key
	end
	local saved = pcall(function() plugin:SetSetting(PAIR_SETTING, { server = address, key = newKey }) end)
	if not saved then
		state.message = "Could not save the address. Try again."
		state.online = false
		refreshUi()
		return
	end
	SERVER_URL = address
	PLUGIN_KEY = newKey
	pairBox.Text = ""
	addressBox.Text = address
	state.online = false
	state.message = "Reconnecting to the saved address..."
	refreshUi()
end)
refreshUi()

---------------------------------------------------------------- connection loop
local function post(body)
	local requestServer, requestKey = SERVER_URL, PLUGIN_KEY
	local ok, response = pcall(function()
		return HttpService:RequestAsync({
			Url = SERVER_URL .. "/api/plugin/poll",
			Method = "POST",
			Headers = { ["Content-Type"] = "application/json", ["x-plugin-key"] = PLUGIN_KEY },
			Body = HttpService:JSONEncode(body),
		})
	end)
	if requestServer ~= SERVER_URL or requestKey ~= PLUGIN_KEY then
		return nil, "Connection changed; reconnecting", 0
	end
	if not ok then
		return nil, tostring(response), 0
	end
	if not response.Success then
		return nil, "server answered " .. tostring(response.StatusCode), response.StatusCode
	end
	local okJson, data = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)
	if not okJson or type(data) ~= "table" then
		return nil, "unreadable server response", 0
	end
	return data
end

local alive = true
plugin.Unloading:Connect(function()
	alive = false
end)

task.spawn(function()
	local outbox = {}
	local outboxBytes = 0
	local failures = 0
	local outboxKey = PLUGIN_KEY
	while alive do
		if outboxKey ~= PLUGIN_KEY then
			outbox = {}
			outboxBytes = 0
			outboxKey = PLUGIN_KEY
		end
		if not state.enabled then
			task.wait(0.5)
		else
			local data, err, code = post({
				version = PLUGIN_VERSION,
				place = { name = game.Name, placeId = tostring(game.PlaceId) },
				results = outbox,
			})
			if data then
				outbox = {}
				outboxBytes = 0
				failures = 0
                state.stopped = data.paused == true
                if data.paused then state.online = false refreshUi() task.wait(1) end
				if not state.online and not data.paused then
					state.online = true
					logLine("Connected")
				end
				for _, cmd in ipairs(data.commands or {}) do
                    local controlOk, control = pcall(function()
                        local response = HttpService:RequestAsync({Url = SERVER_URL .. "/api/plugin/control?command=" .. tostring(cmd.id), Method = "GET", Headers = {["x-plugin-key"] = PLUGIN_KEY}})
                        if not response.Success then error("Cannot verify stop status") end
                        return HttpService:JSONDecode(response.Body)
                    end)
                    local ok, res
                    if not controlOk or control.paused then
                        state.stopped = true refreshUi()
                        ok, res = false, "Stopped or stop status unavailable: command was not executed."
                    else
                        ok, res = execute(cmd)
                    end
					local entry = { id = cmd.id, ok = ok }
					if ok then
						local okJson, json = pcall(function()
							return HttpService:JSONEncode({ value = res })
						end)
						if okJson and #json < 350000 then
							entry.json = json
							outboxBytes = outboxBytes + #json
						else
							entry.ok = false
							entry.error = okJson and "Result is too large to send. Ask for less (smaller depth or limit)."
								or "Result could not be encoded as JSON."
						end
					else
						entry.error = tostring(res)
					end
					outbox[#outbox + 1] = entry
					state.done = state.done + 1
					logLine((entry.ok and "ok    " or "FAIL  ") .. tostring(cmd.type))
					-- Keep each request under Roblox's 1 MB body limit.
					if outboxBytes > 250000 then
						local flushed = post({ version = PLUGIN_VERSION, results = outbox, noWait = true })
						if flushed then
							outbox = {}
							outboxBytes = 0
						end
					end
				end
			else
				failures = failures + 1
				state.online = false
				if failures >= 5 and outboxBytes > 0 then
					-- The results themselves may be what the server rejects. Report them as failed instead of retrying forever.
					for _, entry in ipairs(outbox) do
						entry.ok = false
						entry.json = nil
						entry.error = "The result could not be delivered to the dashboard."
					end
					outboxBytes = 0
				end
				if code == 401 or code == 404 then
					state.message = "Check the app address, or paste a current project's AI link below to pair this plugin."
				elseif string.find(string.lower(tostring(err)), "http requests are not enabled", 1, true) then
					state.message = "Enable 'Allow HTTP Requests' in Game Settings > Security, then wait a moment."
				else
					state.message = "Cannot reach the dashboard: " .. string.sub(tostring(err), 1, 140)
				end
				refreshUi()
				task.wait(math.min(2 * failures, 15))
			end
		end
	end
end)
`;
