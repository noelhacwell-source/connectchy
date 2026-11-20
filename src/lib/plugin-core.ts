/** Connectchy plugin, part 1: services, paths, value conversion, tree. Plain Lua 5.1 syntax. */
export const PLUGIN_CORE = String.raw`-- Connectchy: connects this Studio session to your Connectchy dashboard / AI agent.
-- Generated file. The key below is a secret for ONE connection. Do not share it.
local SERVER_URL = "__SERVER_URL__"
local PLUGIN_KEY = "__PLUGIN_KEY__"
local PLUGIN_VERSION = "1.4.1"
local ADDRESS_SETTING = "StudioLinkServer:" .. PLUGIN_KEY
local function validServerAddress(value)
	if type(value) ~= "string" then return nil end
	local trimmed = string.gsub(value, "^%s*(.-)%s*$", "%1")
	trimmed = string.gsub(trimmed, "/+$", "")
	local scheme, host = string.match(trimmed, "^(https?)://([%w%.:%-%[%]]+)$")
	if not scheme or not host then return nil end
	return trimmed
end
local okSaved, savedAddress = pcall(function() return plugin:GetSetting(ADDRESS_SETTING) end)
if okSaved and validServerAddress(savedAddress) then SERVER_URL = validServerAddress(savedAddress) end
local PAIR_SETTING = "StudioLinkPairingV1"
local okPair, savedPair = pcall(function() return plugin:GetSetting(PAIR_SETTING) end)
if okPair and type(savedPair) == "table" and type(savedPair.key) == "string"
	and string.match(savedPair.key, "^pk_[%w_%-]+$") and validServerAddress(savedPair.server) then
	PLUGIN_KEY = savedPair.key
	SERVER_URL = validServerAddress(savedPair.server)
end

local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")
local InsertService = game:GetService("InsertService")
local CollectionService = game:GetService("CollectionService")
local ScriptEditorService = game:GetService("ScriptEditorService")

-- Only run in the editing session, never inside a play test.
if not RunService:IsEdit() then
	return
end

local ROOT_SERVICES = {
	"Workspace", "Players", "Lighting", "MaterialService", "ReplicatedFirst", "ReplicatedStorage",
	"ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Teams",
	"SoundService", "TextChatService",
}

local PROPERTY_NAMES = {
	"Anchored", "CanCollide", "CanTouch", "CanQuery", "Transparency", "Reflectance", "Material", "Color",
	"Size", "Position", "Orientation", "Shape", "Massless", "CastShadow", "Locked", "Text", "TextColor3",
	"TextSize", "TextScaled", "TextWrapped", "RichText", "FontFace", "TextXAlignment", "TextYAlignment",
	"TextTransparency", "PlaceholderText", "BackgroundColor3", "BackgroundTransparency", "BorderSizePixel",
	"AnchorPoint", "ZIndex", "LayoutOrder", "Visible", "ClipsDescendants", "AutomaticSize", "Image",
	"ImageColor3", "ImageTransparency", "ScaleType", "Enabled", "Value", "Disabled", "RunContext", "MeshId",
	"TextureID", "Texture", "Face", "SoundId", "Volume", "Looped", "PlaybackSpeed", "Brightness", "Range",
	"Angle", "PrimaryPart", "WalkSpeed", "JumpPower", "JumpHeight", "MaxHealth", "Health", "DisplayName",
	"ResetOnSpawn", "IgnoreGuiInset", "DisplayOrder", "Adornee", "MaxDistance", "HoldDuration", "ActionText",
	"ObjectText", "ClockTime", "Ambient", "OutdoorAmbient", "FogEnd", "FogColor", "Gravity", "TeamColor",
	"AutoAssignable", "Neutral", "Duration", "C0", "C1", "Part0", "Part1", "CornerRadius", "Thickness",
	"Padding", "FillDirection", "HorizontalAlignment", "VerticalAlignment", "SortOrder", "CellSize",
	"CellPadding", "CanvasSize", "ScrollBarThickness", "Archivable",
}

---------------------------------------------------------------- paths
local function childByName(parent, seg)
	local found = parent:FindFirstChild(seg)
	if found then
		return found
	end
	local base, idx = string.match(seg, "^(.*)#(%d+)$")
	if base then
		local wanted = tonumber(idx)
		local count = 0
		for _, child in ipairs(parent:GetChildren()) do
			if child.Name == base then
				count = count + 1
				if count == wanted then
					return child
				end
			end
		end
	end
	return nil
end

local function resolve(path)
	if type(path) ~= "string" or path == "" then
		error("A path string is required, e.g. 'Workspace/Map/Wall'", 0)
	end
	local parts = {}
	for seg in string.gmatch(path, "[^/]+") do
		parts[#parts + 1] = seg
	end
	if parts[1] == "game" then
		table.remove(parts, 1)
	end
	if #parts == 0 then
		return game
	end
	local ok, service = pcall(function()
		return game:GetService(parts[1])
	end)
	local current = (ok and service) or game:FindFirstChild(parts[1])
	if not current then
		error("No service named '" .. parts[1] .. "'. Paths start at a service, e.g. 'Workspace/...'", 0)
	end
	for i = 2, #parts do
		local nextInst = childByName(current, parts[i])
		if not nextInst then
			error("Path not found: no '" .. parts[i] .. "' inside " .. current:GetFullName(), 0)
		end
		current = nextInst
	end
	return current
end

local function segmentOf(inst)
	local parent = inst.Parent
	local name = inst.Name
	if not parent or parent == game then
		return name
	end
	local count = 0
	for _, child in ipairs(parent:GetChildren()) do
		if child.Name == name then
			count = count + 1
			if child == inst then
				break
			end
		end
	end
	if count > 1 then
		return name .. "#" .. count
	end
	return name
end

local function pathOf(inst)
	if inst == game then
		return "game"
	end
	local segs = {}
	local current = inst
	while current and current ~= game do
		table.insert(segs, 1, segmentOf(current))
		current = current.Parent
	end
	return table.concat(segs, "/")
end

---------------------------------------------------------------- values
local function round(n)
	return math.floor(n * 1000 + 0.5) / 1000
end

local function ser(v, depth)
	depth = depth or 0
	local t = typeof(v)
	if t == "nil" or t == "boolean" or t == "string" then
		return v
	end
	if t == "number" then
		if v ~= v or v == math.huge or v == -math.huge then
			return tostring(v)
		end
		return v
	end
	if t == "Instance" then
		return { __type = "Instance", path = pathOf(v), className = v.ClassName }
	end
	if t == "Vector3" then
		return { __type = "Vector3", value = { round(v.X), round(v.Y), round(v.Z) } }
	end
	if t == "Vector2" then
		return { __type = "Vector2", value = { round(v.X), round(v.Y) } }
	end
	if t == "Color3" then
		return { __type = "Color3", value = { math.floor(v.R * 255 + 0.5), math.floor(v.G * 255 + 0.5), math.floor(v.B * 255 + 0.5) } }
	end
	if t == "UDim2" then
		return { __type = "UDim2", value = { round(v.X.Scale), v.X.Offset, round(v.Y.Scale), v.Y.Offset } }
	end
	if t == "UDim" then
		return { __type = "UDim", value = { round(v.Scale), v.Offset } }
	end
	if t == "CFrame" then
		local rx, ry, rz = v:ToOrientation()
		return {
			__type = "CFrame",
			position = { round(v.X), round(v.Y), round(v.Z) },
			rotation = { round(math.deg(rx)), round(math.deg(ry)), round(math.deg(rz)) },
		}
	end
	if t == "EnumItem" then
		return tostring(v)
	end
	if t == "BrickColor" then
		return { __type = "BrickColor", value = v.Name }
	end
	if t == "NumberRange" then
		return { __type = "NumberRange", value = { v.Min, v.Max } }
	end
	if t == "table" then
		if depth > 6 then
			return "<nested table>"
		end
		local out = {}
		if #v > 0 then
			for i, item in ipairs(v) do
				out[i] = ser(item, depth + 1)
			end
		else
			for k, item in pairs(v) do
				out[tostring(k)] = ser(item, depth + 1)
			end
		end
		return out
	end
	return tostring(v)
end

local function toEnum(s)
	local enumName, itemName = string.match(s, "^Enum%.([%w_]+)%.([%w_]+)$")
	if not enumName then
		return nil
	end
	local ok, item = pcall(function()
		return Enum[enumName][itemName]
	end)
	if ok then
		return item
	end
	return nil
end

local function de(v)
	if type(v) ~= "table" then
		return v
	end
	local t = v.__type
	if not t then
		local out = {}
		for k, item in pairs(v) do
			out[k] = de(item)
		end
		return out
	end
	local a = v.value
	if t == "Vector3" then
		return Vector3.new(a[1], a[2], a[3])
	elseif t == "Vector2" then
		return Vector2.new(a[1], a[2])
	elseif t == "Color3" then
		return Color3.fromRGB(a[1], a[2], a[3])
	elseif t == "UDim2" then
		return UDim2.new(a[1], a[2], a[3], a[4])
	elseif t == "UDim" then
		return UDim.new(a[1], a[2])
	elseif t == "CFrame" then
		local p = v.position or { 0, 0, 0 }
		local r = v.rotation or { 0, 0, 0 }
		return CFrame.new(p[1], p[2], p[3]) * CFrame.fromOrientation(math.rad(r[1]), math.rad(r[2]), math.rad(r[3]))
	elseif t == "BrickColor" then
		return BrickColor.new(a)
	elseif t == "NumberRange" then
		return NumberRange.new(a[1], a[2])
	elseif t == "Instance" then
		return resolve(v.path)
	elseif t == "Enum" then
		return toEnum(a)
	elseif t == "Font" then
		return Font.new(v.family, Enum.FontWeight[v.weight or "Regular"], Enum.FontStyle[v.style or "Normal"])
	end
	error("Unsupported value type '" .. tostring(t) .. "'. Use run_luau for this property.", 0)
end

-- Convert a JSON value into whatever type the property currently holds.
local function coerce(current, v)
	local want = typeof(current)
	if type(v) == "table" then
		if v.__type then
			return de(v)
		end
		local n = #v
		if want == "Vector3" and n == 3 then
			return Vector3.new(v[1], v[2], v[3])
		elseif want == "Color3" and n == 3 then
			return Color3.fromRGB(v[1], v[2], v[3])
		elseif want == "Vector2" and n == 2 then
			return Vector2.new(v[1], v[2])
		elseif want == "UDim2" and n == 4 then
			return UDim2.new(v[1], v[2], v[3], v[4])
		elseif want == "UDim" and n == 2 then
			return UDim.new(v[1], v[2])
		elseif want == "CFrame" and n == 3 then
			return CFrame.new(v[1], v[2], v[3])
		elseif want == "NumberRange" and n == 2 then
			return NumberRange.new(v[1], v[2])
		end
		return de(v)
	end
	if type(v) == "string" and want ~= "string" then
		if want == "EnumItem" then
			local direct = toEnum(v)
			if direct then
				return direct
			end
			local ok, item = pcall(function()
				return current.EnumType[v]
			end)
			if ok and item then
				return item
			end
		elseif want == "Color3" and string.match(v, "^#%x%x%x%x%x%x$") then
			return Color3.fromHex(v)
		elseif want == "BrickColor" then
			return BrickColor.new(v)
		else
			local enumItem = toEnum(v)
			if enumItem then
				return enumItem
			end
		end
	end
	return v
end

local function setProps(inst, props)
	local errors = {}
	if type(props) ~= "table" then
		return errors
	end
	for key, value in pairs(props) do
		local ok, err = pcall(function()
			if key == "Parent" then
				inst.Parent = resolve(value)
			elseif key == "Attributes" and type(value) == "table" then
				for attrName, attrValue in pairs(value) do
					inst:SetAttribute(attrName, de(attrValue))
				end
			elseif key == "Tags" and type(value) == "table" then
				for _, tag in ipairs(value) do
					CollectionService:AddTag(inst, tag)
				end
			else
				local okGet, current = pcall(function()
					return inst[key]
				end)
				if not okGet then
					error("'" .. tostring(key) .. "' is not a property of " .. inst.ClassName, 0)
				end
				local newValue = coerce(current, value)
				local okSet, setErr = pcall(function()
					inst[key] = newValue
				end)
				if not okSet then
					-- Object references (PrimaryPart, Adornee, Part0...) may be given as a path.
					local okPath, target = false, nil
					if type(value) == "string" then
						okPath, target = pcall(resolve, value)
					end
					if okPath then
						inst[key] = target
					else
						error(setErr, 0)
					end
				end
			end
		end)
		if not ok then
			errors[#errors + 1] = tostring(key) .. ": " .. tostring(err)
		end
	end
	return errors
end

---------------------------------------------------------------- tree + scripts
local function buildTree(inst, path, depth, budget)
	local children = inst:GetChildren()
	local node = { name = inst.Name, className = inst.ClassName, path = path, childCount = #children }
	if depth > 0 and #children > 0 then
		node.children = {}
		local seen = {}
		for _, child in ipairs(children) do
			if budget.left <= 0 then
				node.truncated = true
				break
			end
			budget.left = budget.left - 1
			local name = child.Name
			seen[name] = (seen[name] or 0) + 1
			local seg = name
			if seen[name] > 1 then
				seg = name .. "#" .. seen[name]
			end
			node.children[#node.children + 1] = buildTree(child, path .. "/" .. seg, depth - 1, budget)
		end
	end
	return node
end

local function getSource(inst)
	local ok, source = pcall(function()
		return ScriptEditorService:GetEditorSource(inst)
	end)
	if ok and type(source) == "string" then
		return source
	end
	return inst.Source
end

local function setSource(inst, source)
	local ok = pcall(function()
		ScriptEditorService:UpdateSourceAsync(inst, function()
			return source
		end)
	end)
	if not ok then
		inst.Source = source
	end
end

local function requireScript(path)
	local inst = resolve(path)
	if not inst:IsA("LuaSourceContainer") then
		error(pathOf(inst) .. " is a " .. inst.ClassName .. ", not a script", 0)
	end
	return inst
end

local function lineCount(source)
	local _, newlines = string.gsub(source, "\n", "\n")
	return newlines + 1
end
`;
