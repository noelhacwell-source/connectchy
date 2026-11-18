/** Typed Roblox inspection and editing tools. Concatenated before the handler table. */
export const PLUGIN_ADVANCED=String.raw`
local ADVANCED_READ_ONLY = {
 inspect_attributes=true, list_tags=true, find_tagged=true, get_class_counts=true,
 get_project_stats=true, get_remote_inventory=true, get_spawn_inventory=true,
 get_sound_inventory=true, get_gui_inventory=true, get_constraint_inventory=true,
 get_collision_groups=true, get_lighting_settings=true, get_instance_bounds=true,
 check_script_syntax=true, validate_instance_paths=true,
}
local function installAdvancedHandlers(handlers, scanAll, describe)
 local function names(value,maxLength)
  if type(value) ~= "table" or #value < 1 or #value > 100 then error("Provide 1–100 names",0) end
  for _, name in ipairs(value) do if type(name) ~= "string" or name == "" or #name > (maxLength or 100) then error("Invalid name",0) end end
  return value
 end
 local function limit(p, max) return math.max(1,math.min(max,math.floor(tonumber(p.limit) or 100))) end
 local function inventory(p, predicate, properties)
  local out, visited = {}, 0
  local cap = limit(p,500)
  scanAll(p.under,function(inst)
   visited=visited+1
   if visited % 250 == 0 then task.wait() end
   if predicate(inst) then
    local item=describe(inst)
    for _, property in ipairs(properties) do local ok,value=pcall(function() return inst[property] end) if ok then item[property]=ser(value) end end
    out[#out+1]=item
   end
   return #out>=cap or visited>=20000
  end)
  return {items=out,truncated=#out>=cap or visited>=20000,inspected=visited}
 end
 handlers.inspect_attributes=function(p) return {path=p.path,attributes=ser(resolve(p.path):GetAttributes())} end
 handlers.set_attributes=function(p)
  local inst=resolve(p.path)
  if type(p.attributes)~="table" then error("attributes is required",0) end
  local values, count={},0
  local probe=Instance.new("Folder")
  local ok,err=pcall(function() for name,value in pairs(p.attributes) do count=count+1 if count>100 then error("Too many attributes") end local converted=de(value) probe:SetAttribute(name,converted) values[name]=converted end end)
  probe:Destroy()
  if not ok then error(tostring(err),0) end
  for name,value in pairs(values) do inst:SetAttribute(name,value) end
  return {path=pathOf(inst),updated=count}
 end
 handlers.remove_attributes=function(p) local inst=resolve(p.path) local values=names(p.names) for _,name in ipairs(values) do inst:SetAttribute(name,nil) end return {path=pathOf(inst),removed=#values} end
 handlers.list_tags=function(p) if p.path then return {path=p.path,tags=CollectionService:GetTags(resolve(p.path))} end return {tags=CollectionService:GetAllTags()} end
 handlers.add_tags=function(p) local inst=resolve(p.path) local tags=names(p.tags) for _,tag in ipairs(tags) do CollectionService:AddTag(inst,tag) end return {path=pathOf(inst),tags=CollectionService:GetTags(inst)} end
 handlers.remove_tags=function(p) local inst=resolve(p.path) local tags=names(p.tags) for _,tag in ipairs(tags) do CollectionService:RemoveTag(inst,tag) end return {path=pathOf(inst),tags=CollectionService:GetTags(inst)} end
 handlers.find_tagged=function(p)
  if type(p.tag)~="string" or p.tag=="" then error("tag is required",0) end
  local out={} local cap=limit(p,500)
  local tagged=CollectionService:GetTagged(p.tag)
  for _,inst in ipairs(tagged) do if #out>=cap then break end out[#out+1]=describe(inst) end
  return {items=out,truncated=#tagged>#out}
 end
 handlers.get_class_counts=function(p)
  local counts,visited={},0
  scanAll(p.under,function(inst) visited=visited+1 counts[inst.ClassName]=(counts[inst.ClassName] or 0)+1 if visited%250==0 then task.wait() end return visited>=20000 end)
  return {classes=counts,total=visited,truncated=visited>=20000}
 end
 handlers.get_project_stats=function(p)
  local stats={total=0,parts=0,anchored=0,scripts=0,scriptLines=0,sounds=0,lights=0,guiObjects=0,remotes=0}
  scanAll(p.under,function(inst)
   stats.total=stats.total+1
   if inst:IsA("BasePart") then stats.parts=stats.parts+1 if inst.Anchored then stats.anchored=stats.anchored+1 end end
   if inst:IsA("LuaSourceContainer") then stats.scripts=stats.scripts+1 local ok,source=pcall(getSource,inst) if ok then stats.scriptLines=stats.scriptLines+lineCount(source) end end
   if inst:IsA("Sound") then stats.sounds=stats.sounds+1 end
   if inst:IsA("Light") then stats.lights=stats.lights+1 end
   if inst:IsA("GuiObject") then stats.guiObjects=stats.guiObjects+1 end
   if inst:IsA("RemoteEvent") or inst:IsA("RemoteFunction") or inst:IsA("UnreliableRemoteEvent") then stats.remotes=stats.remotes+1 end
   if stats.total%250==0 then task.wait() end return stats.total>=20000
  end)
  stats.truncated=stats.total>=20000
  return stats
 end
 handlers.get_remote_inventory=function(p) return inventory(p,function(i) return i:IsA("RemoteEvent") or i:IsA("RemoteFunction") or i:IsA("UnreliableRemoteEvent") end,{}) end
 handlers.get_spawn_inventory=function(p) return inventory(p,function(i) return i:IsA("SpawnLocation") end,{"Enabled","Neutral","TeamColor","AllowTeamChangeOnTouch","Duration"}) end
 handlers.get_sound_inventory=function(p) return inventory(p,function(i) return i:IsA("Sound") end,{"SoundId","Volume","Looped","PlaybackSpeed","RollOffMaxDistance"}) end
 handlers.get_gui_inventory=function(p) return inventory(p,function(i) return i:IsA("LayerCollector") end,{"Enabled","ResetOnSpawn","DisplayOrder","IgnoreGuiInset"}) end
 handlers.get_constraint_inventory=function(p) return inventory(p,function(i) return i:IsA("Constraint") end,{"Enabled","Attachment0","Attachment1","Visible"}) end
 handlers.get_collision_groups=function()
  local ok,groups=pcall(function() return workspace:GetRegisteredCollisionGroups() end)
  if not ok then groups=game:GetService("PhysicsService"):GetRegisteredCollisionGroups() end
  return {groups=ser(groups)}
 end
 handlers.get_lighting_settings=function()
  local lighting,settings=game:GetService("Lighting"),{}
  for _,key in ipairs({"ClockTime","Brightness","Ambient","OutdoorAmbient","FogColor","FogStart","FogEnd","GlobalShadows","ExposureCompensation","EnvironmentDiffuseScale","EnvironmentSpecularScale"}) do local ok,value=pcall(function() return lighting[key] end) if ok then settings[key]=ser(value) end end
  local effects={} for _,child in ipairs(lighting:GetChildren()) do effects[#effects+1]=describe(child) end
  return {settings=settings,effects=effects}
 end
 handlers.get_instance_bounds=function(p)
  local inst=resolve(p.path) local cf,size
  if inst:IsA("Model") then cf,size=inst:GetBoundingBox() elseif inst:IsA("BasePart") then cf,size=inst.CFrame,inst.Size else error("Bounds require a Model or BasePart",0) end
  return {path=pathOf(inst),cframe=ser(cf),size=ser(size),pivot=ser(inst:GetPivot())}
 end
 handlers.pivot_instance=function(p)
  local inst=resolve(p.path)
  if not inst:IsA("PVInstance") then error("Pivot requires a Model or BasePart",0) end
  local position=p.position local rotation=p.rotation or {0,0,0}
  for _,vector in ipairs({position or false,rotation}) do if type(vector)~="table" or #vector~=3 then error("Use three numeric coordinates",0) end for _,value in ipairs(vector) do if type(value)~="number" or value~=value or math.abs(value)>1000000000 then error("Invalid coordinate",0) end end end
  inst:PivotTo(CFrame.new(position[1],position[2],position[3])*CFrame.fromOrientation(math.rad(rotation[1]),math.rad(rotation[2]),math.rad(rotation[3])))
  return {path=pathOf(inst),pivot=ser(inst:GetPivot())}
 end
 local function parts(p)
  local inst=resolve(p.path) local out={}
  if inst:IsA("BasePart") then out[1]=inst end
  if p.recursive then for _,child in ipairs(inst:GetDescendants()) do if child:IsA("BasePart") then out[#out+1]=child end if #out>5000 then error("Limit is 5,000 parts; select a smaller subtree",0) end end end
  if #out==0 then error("No parts in the selected scope",0) end
  return out
 end
 handlers.set_anchored=function(p) if type(p.anchored)~="boolean" then error("anchored must be boolean",0) end local values=parts(p) for _,part in ipairs(values) do part.Anchored=p.anchored end return {updated=#values,anchored=p.anchored} end
 handlers.set_collision_group=function(p)
  if type(p.group)~="string" then error("group is required",0) end
  local ok,registered=pcall(function() return workspace:IsCollisionGroupRegistered(p.group) end)
  if not ok then registered=game:GetService("PhysicsService"):IsCollisionGroupRegistered(p.group) end
  if not registered then error("Collision group is not registered",0) end
  local values=parts(p) for _,part in ipairs(values) do part.CollisionGroup=p.group end return {updated=#values,group=p.group}
 end
 handlers.check_script_syntax=function(p)
  if type(loadstring)~="function" then error("Syntax compilation is unavailable in this Studio version",0) end
  local out={} local cap=limit(p,100)
  scanAll(p.under,function(inst)
   if inst:IsA("LuaSourceContainer") then
    local ok,source=pcall(getSource,inst) local item=describe(inst)
    if not ok then item.error=tostring(source) elseif #source>200000 then item.error="Source exceeds 200 KB check limit" else local fn,err=loadstring(source,"="..pathOf(inst)) item.valid=fn~=nil item.error=err end
    out[#out+1]=item task.wait()
   end
   return #out>=cap
  end)
  return {scripts=out,truncated=#out>=cap,syntaxOnly=true}
 end
 handlers.validate_instance_paths=function(p)
  local values=names(p.paths,1000) local out={} local missing=0
  for _,value in ipairs(values) do local ok,inst=pcall(resolve,value) if ok then out[#out+1]={path=value,exists=true,className=inst.ClassName} else missing=missing+1 out[#out+1]={path=value,exists=false,error=tostring(inst)} end end
  return {paths=out,missing=missing,passed=missing==0}
 end
end
`;
