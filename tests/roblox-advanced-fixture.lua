local objects = {}
local base = {Part={BasePart=true,PVInstance=true},SpawnLocation={BasePart=true,PVInstance=true},Model={PVInstance=true},Script={LuaSourceContainer=true},LocalScript={LuaSourceContainer=true},RemoteEvent={},RemoteFunction={},Sound={},PointLight={Light=true},ScreenGui={LayerCollector=true},Frame={GuiObject=true},HingeConstraint={Constraint=true}}
local function newInst(class,name,parent)
 local i={ClassName=class,Name=name,Parent=parent,children={},attrs={},tags={},Anchored=false,Source='',CFrame={x=0},Size={1,2,3},CollisionGroup='Default'}
 function i:IsA(c) return c==self.ClassName or (base[self.ClassName] and base[self.ClassName][c]) or false end
 function i:GetChildren() return self.children end
 function i:GetDescendants() local out={} local function visit(p) for _,c in ipairs(p.children) do out[#out+1]=c visit(c) end end visit(self) return out end
 function i:GetAttributes() return self.attrs end
 function i:SetAttribute(key,value) assert(type(key)=='string' and key~='','Invalid attribute name') assert(type(value)~='table','Invalid attribute value') self.attrs[key]=value end
 function i:GetPivot() return self.CFrame end
 function i:PivotTo(cf) self.CFrame=cf end
 function i:GetBoundingBox() return self.CFrame,self.Size end
 function i:Destroy() self.destroyed=true end
 if parent then parent.children[#parent.children+1]=i end
 local p=name if parent then for key,value in pairs(objects) do if value==parent then p=key..'/'..name break end end end objects[p]=i
 return i
end
local workspace=newInst('Workspace','Workspace')
local lighting=newInst('Lighting','Lighting') lighting.ClockTime=12 lighting.Brightness=2
local scripts=newInst('ServerScriptService','ServerScriptService')
local map=newInst('Model','Map',workspace)
local part=newInst('Part','Floor',map) part.Anchored=true
local spawn=newInst('SpawnLocation','Spawn',map)
local remote=newInst('RemoteEvent','Event',map)
local sound=newInst('Sound','Music',map) sound.SoundId='rbxassetid://1' sound.Volume=0.5
local gui=newInst('ScreenGui','HUD',map) gui.Enabled=true
local frame=newInst('Frame','Frame',gui)
local light=newInst('PointLight','Light',part)
local constraint=newInst('HingeConstraint','Joint',map) constraint.Enabled=true constraint.Attachment0=part
local good=newInst('Script','Good',scripts) good.Source='error("This must never run")'
local bad=newInst('Script','Bad',scripts) bad.Source='local ='
local atmosphere=newInst('Atmosphere','Atmosphere',lighting)
function workspace:GetRegisteredCollisionGroups() return {{name='Default'}} end
function workspace:IsCollisionGroupRegistered(name) return name=='Default' end
local oldPhysics={GetRegisteredCollisionGroups=function() return {{name='Default'}} end,IsCollisionGroupRegistered=function(_,name) return name=='Default' end}
local game={GetService=function(_,name) return name=='PhysicsService' and oldPhysics or assert(objects[name],'Missing service') end}
local Instance={new=function(class) return newInst(class,'Probe') end}
local CollectionService={}
function CollectionService:AddTag(i,tag) i.tags[tag]=true end
function CollectionService:RemoveTag(i,tag) i.tags[tag]=nil end
function CollectionService:GetTags(i) local out={} for tag in pairs(i.tags) do out[#out+1]=tag end return out end
function CollectionService:GetAllTags() local out={} local seen={} for _,i in pairs(objects) do for tag in pairs(i.tags) do if not seen[tag] then out[#out+1]=tag seen[tag]=true end end end return out end
function CollectionService:GetTagged(tag) local out={} for _,i in pairs(objects) do if i.tags[tag] then out[#out+1]=i end end return out end
local CFrame={new=function(x,y,z) return setmetatable({x=x,y=y,z=z},{__mul=function(a,b) return a end}) end,fromOrientation=function() return {} end}
local task={wait=function() end}
local loadstring=load
local function resolve(p) local value=assert(objects[p],'Missing path '..tostring(p)) return value end
local function pathOf(i) for path,value in pairs(objects) do if i==value then return path end end return i.Name end
local function ser(value) return value end
local function de(value) return value end
local function getSource(i) return i.Source end
local function lineCount(source) local _,count=source:gsub('\n','') return count+1 end
local function describe(i) return {path=pathOf(i),className=i.ClassName,name=i.Name} end
local function scanAll(under,visit) local roots=under and {resolve(under)} or {workspace,lighting,scripts} for _,root in ipairs(roots) do for _,i in ipairs(root:GetDescendants()) do if visit(i) then return end end end end
-- __MODULE__
local handlers={}
installAdvancedHandlers(handlers,scanAll,describe)
local exercised={}
local function run(name,p) exercised[name]=true return handlers[name](p or {}) end
assert(run('inspect_attributes',{path='Workspace/Map'}).attributes)
assert(run('set_attributes',{path='Workspace/Map',attributes={Region='Lobby'}}).updated==1)
assert(map.attrs.Region=='Lobby')
local ok=pcall(handlers.set_attributes,{path='Workspace/Map',attributes={Bad={nested=true}}}) assert(not ok and not map.attrs.Bad)
assert(run('remove_attributes',{path='Workspace/Map',names={'Region'}}).removed==1 and not map.attrs.Region)
run('add_tags',{path='Workspace/Map',tags={'Level'}})
assert(#run('list_tags',{path='Workspace/Map'}).tags==1)
assert(#run('list_tags').tags==1)
assert(#run('find_tagged',{tag='Level'}).items==1)
run('remove_tags',{path='Workspace/Map',tags={'Level'}}) assert(#CollectionService:GetTags(map)==0)
assert(run('get_class_counts',{under='Workspace'}).classes.Part==1)
local stats=run('get_project_stats') assert(stats.parts==2 and stats.scripts==2 and stats.guiObjects==1)
assert(#run('get_remote_inventory').items==1)
assert(#run('get_spawn_inventory').items==1)
assert(#run('get_sound_inventory').items==1)
assert(#run('get_gui_inventory').items==1)
assert(#run('get_constraint_inventory').items==1)
assert(#run('get_collision_groups').groups==1)
workspace.GetRegisteredCollisionGroups=function() error('Old version') end
assert(#run('get_collision_groups').groups==1)
assert(run('get_lighting_settings').settings.ClockTime==12)
assert(run('get_instance_bounds',{path='Workspace/Map'}).size[1]==1)
run('pivot_instance',{path='Workspace/Map',position={3,4,5}}) assert(map.CFrame.x==3)
assert(not pcall(handlers.pivot_instance,{path='Workspace/Map'}))
assert(run('set_anchored',{path='Workspace/Map',anchored=true,recursive=true}).updated==2 and spawn.Anchored)
assert(not pcall(handlers.set_anchored,{path='Workspace/Map',anchored='true',recursive=true}))
assert(run('set_collision_group',{path='Workspace/Map',group='Default',recursive=true}).updated==2)
assert(not pcall(handlers.set_collision_group,{path='Workspace/Map',group='Missing',recursive=true}))
local syntax=run('check_script_syntax',{under='ServerScriptService'}) assert(#syntax.scripts==2 and syntax.scripts[1].valid and not syntax.scripts[2].valid)
local paths=run('validate_instance_paths',{paths={'Workspace/Map','Workspace/Absent'}}) assert(paths.missing==1 and paths.passed==false)
local count=0 for _ in pairs(exercised) do count=count+1 end assert(count==22,'Expected 22 tools, got '..count)
return true
