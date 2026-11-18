# Connectchy feature release

347 new capabilities. Existing chat and task features are not included in this inventory.

Roblox tools require plugin 1.4.0; advanced VS Code tools require extension 0.2.0. Language-provider tools depend on the project's installed language extension. Native operations require the editor to be open and connected.

1. **Issue reports** — Track a defect separately from chat and tasks.
   Surface: shared; entry: issue.

2. **Reproduction procedures** — Store ordered reproduction steps.
   Surface: shared; entry: issue.steps.

3. **Severity triage** — Distinguish low, normal, high and blocker defects.
   Surface: shared; entry: issue.severity.

4. **Expected-versus-actual records** — Keep the expected and observed outcomes together.
   Surface: shared; entry: issue.expected.

5. **Resolution evidence gate** — A defect cannot be resolved without resolution notes.
   Surface: shared; entry: issue.resolution.

6. **Affected-path index** — Attach instance or project paths to defects.
   Surface: shared; entry: issue.paths.

7. **Related defect links** — Validate links to existing issue records.
   Surface: shared; entry: issue.relatedIds.

8. **Duplicate-title warnings** — Report existing matching titles when creating a record.
   Surface: shared; entry: create.

9. **Milestone outcomes** — Track acceptance criteria separately from implementation tasks.
   Surface: shared; entry: milestone.

10. **Milestone target dates** — Record a calendar deadline for an outcome.
   Surface: shared; entry: milestone.target.

11. **Task-linked milestones** — Link existing project task IDs to a milestone.
   Surface: shared; entry: milestone.taskIds.

12. **Milestone completion meter** — Compute linked task completion from actual task states.
   Surface: shared; entry: milestone.progress.

13. **Milestone completion gate** — Prevent completion while linked tasks are unfinished.
   Surface: shared; entry: milestone.done.

14. **Overdue work highlighting** — Highlight unresolved records past their due or review dates.
   Surface: shared; entry: due.

15. **Durable project memory** — Store architecture, convention, requirement and glossary cards.
   Surface: shared; entry: memory.

16. **Sourced context cards** — Attach validated HTTP(S) provenance links.
   Surface: shared; entry: memory.source.

17. **Context expiry reviews** — Exclude expired context from generated agent packs.
   Surface: shared; entry: memory.expires.

18. **Memory supersession links** — Link replacement context to an existing memory card.
   Surface: shared; entry: memory.supersedes.

19. **Path-scoped memory** — Associate knowledge with relevant project areas.
   Surface: shared; entry: memory.paths.

20. **Agent context-pack export** — Export current, nonexpired memory as Markdown.
   Surface: shared; entry: context-export.

21. **Runbook prerequisites** — Record prerequisites before running a procedure.
   Surface: shared; entry: runbook.prerequisites.

22. **Ordered reusable runbooks** — Keep repeatable procedures with ordered steps.
   Surface: shared; entry: runbook.steps.

23. **Frozen run instances** — Start a separate copy so later runbook edits do not change an active run.
   Surface: shared; entry: start_run.

24. **Run checklist progress** — Check procedure steps individually.
   Surface: shared; entry: toggle_step.

25. **Required-step completion gate** — Prevent successful completion until every step is checked.
   Surface: shared; entry: run.done.

26. **Run outcome history** — Keep separate successful and failed procedure runs.
   Surface: shared; entry: run.outcome.

27. **Versioned releases** — Require a semantic release version.
   Surface: shared; entry: release.version.

28. **Release acceptance checklists** — Track release-specific acceptance steps.
   Surface: shared; entry: release.steps.

29. **Blocker-aware release gate** — Block release readiness while unresolved blocker issues exist.
   Surface: shared; entry: release.ready.

30. **Release freeze control** — Owner can freeze/unfreeze new AI edits and terminal requests.
   Surface: shared; entry: release.frozen.

31. **Command-derived changelog export** — Export recent actual command outcomes and authors.
   Surface: shared; entry: changelog-export.

32. **Risk register** — Track project risks independently from defects.
   Surface: shared; entry: risk.

33. **Likelihood-impact scoring** — Calculate risk scores from two explicit 1–5 ratings.
   Surface: shared; entry: risk.score.

34. **Risk-ranked views** — Sort risks by their calculated score.
   Surface: shared; entry: sort:risk.

35. **Owned mitigation plans** — Assign a risk owner and mitigation notes.
   Surface: shared; entry: risk.mitigation.

36. **Risk review dates** — Flag risk reviews that are overdue.
   Surface: shared; entry: risk.review.

37. **Dependency inventory** — Record installed dependency versions and registry links.
   Surface: shared; entry: dependency.

38. **License-filtered dependencies** — Inspect dependencies by recorded license.
   Surface: shared; entry: dependency.license.

39. **Upgrade target tracking** — Track a target version and planned upgrade state.
   Surface: shared; entry: dependency.targetVersion.

40. **Dependency review reminders** — Highlight overdue upgrade reviews.
   Surface: shared; entry: dependency.upgrade.

41. **Owner-managed agent profiles** — Only the owner can change agent permission profiles.
   Surface: shared; entry: profile.

42. **Agent command allowlists** — Reject commands outside an active agent's allowlist.
   Surface: shared; entry: profile.allowedCommands.

43. **Agent command budgets** — Check accumulated command usage against a profile limit.
   Surface: shared; entry: profile.commandLimit.

44. **Payload byte budgets** — Check queued payload volume against an agent budget.
   Surface: shared; entry: profile.byteLimit.

45. **Expiring agent permissions** — Reject an agent's commands when its active profile expires.
   Surface: shared; entry: profile.expires.

46. **Scheduled maintenance windows** — Block new AI mutations during a scheduled time window.
   Surface: shared; entry: maintenance.

47. **Reusable test cases** — Store test steps, environment and expected results.
   Surface: shared; entry: testcase.

48. **Command-backed test evidence** — Attach completed command output to a test case.
   Surface: shared; entry: attach_result.

49. **Evidence-derived test verdicts** — Mark tests passed only from an explicit passed result or zero exit code.
   Surface: shared; entry: testcase.status.

50. **Target-based benchmarks** — Compare measured values with upper or lower targets.
   Surface: shared; entry: benchmark.

51. **Shared saved board views** — Persist named search, status, owner and sorting combinations.
   Surface: shared; entry: view.

52. **Board status filtering** — Filter records by their board-specific lifecycle state.
   Surface: shared; entry: filter:status.

53. **Board owner filtering** — Focus a board on one owner.
   Surface: shared; entry: filter:owner.

54. **Board tag filtering** — Filter records by shared tags.
   Surface: shared; entry: filter:tag.

55. **Board text search** — Search record titles, descriptions and tags.
   Surface: shared; entry: filter:query.

56. **Priority sorting** — Sort urgent work ahead of normal and low-priority work.
   Surface: shared; entry: sort:priority.

57. **Due-date sorting** — Order records by their relevant deadline or review date.
   Surface: shared; entry: sort:due.

58. **Atomic bulk owner assignment** — Assign up to 100 selected records in one transaction.
   Surface: shared; entry: bulk:assign.

59. **Atomic bulk archive and recovery** — Archive or restore a selection without partial saves.
   Surface: shared; entry: bulk:archive.

60. **Record revision history** — Inspect the last 20 saved edits and their actor.
   Surface: shared; entry: history.

61. **Optimistic edit protection** — Reject stale record edits rather than overwriting newer work.
   Surface: shared; entry: revision.

62. **Record duplication** — Create a copy of a board record in its initial lifecycle state.
   Surface: shared; entry: clone.

63. **Portable JSON board export** — Export a room's board records for backup or transfer.
   Surface: shared; entry: export:json.

64. **Spreadsheet-friendly CSV export** — Export the visible board with formula-safe cells.
   Surface: shared; entry: export:csv.

65. **Markdown project reports** — Export project records and structured fields in readable form.
   Surface: shared; entry: export:markdown.

66. **Import validation preview** — Validate all records and report duplicate titles before importing.
   Surface: shared; entry: import_preview.

67. **Atomic batch import** — Create up to 100 validated records with all-or-nothing persistence.
   Surface: shared; entry: import.

68. **Session focus timer** — Start, pause and reset a 25-minute local focus session.
   Surface: shared; entry: focus-timer.

69. **Room-specific session goals** — Keep a session goal in this browser for each room.
   Surface: shared; entry: session-goal.

70. **Project health score** — Summarize blockers, overdue reviews and high risks with an explicit score.
   Surface: shared; entry: health.

71. **Mission Control metrics** — See failed/pending commands, blockers, overdue work and open risks.
   Surface: shared; entry: summary.

72. **Compact board reading** — Switch between full details and compact record summaries.
   Surface: shared; entry: compact.

73. **Mission Control search shortcut** — Focus board search with Ctrl/Cmd+Shift+M.
   Surface: shared; entry: shortcut.

74. **Automatic edit checkpoints** — VS Code captures the pre-edit file before applying an approved replacement; ten local checkpoints are retained.
   Surface: vscode; entry: code_write_file.

75. **snapshot files** — Capture up to 20 text files in a local VS Code checkpoint (500 KB total). Last 10 checkpoints are retained.
   Surface: vscode; entry: code_snapshot_files.

76. **list snapshots** — List the connected project's local checkpoints and file hashes.
   Surface: vscode; entry: code_list_snapshots.

77. **compare snapshot** — Compare a checkpoint with current editor contents; returns current hashes required for restore.
   Surface: vscode; entry: code_compare_snapshot.

78. **restore snapshot** — Restore existing checkpoint files with one approved editor edit. Compare first; current hashes are required for every file. Deleted files must be recovered with read_snapshot_file then create_file.
   Surface: vscode; entry: code_restore_snapshot.

79. **delete snapshot** — Delete a local checkpoint after approval. Project files are unchanged.
   Surface: vscode; entry: code_delete_snapshot.

80. **read snapshot file** — Read a captured file for recovery or comparison.
   Surface: vscode; entry: code_read_snapshot_file.

81. **patch file** — Replace exactly one literal occurrence using a current file hash and approved diff.
   Surface: vscode; entry: code_patch_file.

82. **create directory** — Create a project directory after local approval.
   Surface: vscode; entry: code_create_directory.

83. **rename file** — Rename a saved file without overwriting its destination. Requires approval and current hash.
   Surface: vscode; entry: code_rename_file.

84. **delete file** — Move a saved file to the system trash after approval and a checkpoint. Requires a current hash.
   Surface: vscode; entry: code_delete_file.

85. **document symbols** — List document symbols supplied by the installed language extension.
   Surface: vscode; entry: code_document_symbols.

86. **workspace symbols** — Find symbols using the installed workspace language providers.
   Surface: vscode; entry: code_workspace_symbols.

87. **find references** — Find references at a 1-based document position. Requires a language provider.
   Surface: vscode; entry: code_find_references.

88. **find definition** — Find definitions at a 1-based document position.
   Surface: vscode; entry: code_find_definition.

89. **find type definition** — Find type definitions at a 1-based document position.
   Surface: vscode; entry: code_find_type_definition.

90. **hover** — Read language-server hover documentation.
   Surface: vscode; entry: code_hover.

91. **format document** — Propose formatting changes using the installed formatter. Shows a diff and requires the current hash.
   Surface: vscode; entry: code_format_document.

92. **git status** — Read Git status in the connected folder.
   Surface: vscode; entry: code_git_status.

93. **git diff** — Read a Git diff for one allowed text file; external diff drivers are disabled.
   Surface: vscode; entry: code_git_diff.

94. **git log** — Read the latest 30 commits affecting the connected folder.
   Surface: vscode; entry: code_git_log.

95. **git branches** — List local Git branch names.
   Surface: vscode; entry: code_git_branches.

96. **git blame** — Read Git line attribution for an allowed text file.
   Surface: vscode; entry: code_git_blame.

97. **inspect attributes** — Read all attributes on an instance.
   Surface: roblox; entry: inspect_attributes.

98. **set attributes** — Set typed attributes on one instance, with preflight validation.
   Surface: roblox; entry: set_attributes.

99. **remove attributes** — Remove named attributes from one instance.
   Surface: roblox; entry: remove_attributes.

100. **list tags** — List project tags, or tags on a specific instance.
   Surface: roblox; entry: list_tags.

101. **add tags** — Add named CollectionService tags to one instance.
   Surface: roblox; entry: add_tags.

102. **remove tags** — Remove CollectionService tags from one instance.
   Surface: roblox; entry: remove_tags.

103. **find tagged** — Find up to 500 instances with a given tag.
   Surface: roblox; entry: find_tagged.

104. **get class counts** — Count descendants by class, up to 20,000 inspected objects.
   Surface: roblox; entry: get_class_counts.

105. **get project stats** — Count parts, anchored parts, scripts, lights, sounds and GUI objects. Bounded to 20,000 descendants.
   Surface: roblox; entry: get_project_stats.

106. **get remote inventory** — Inspect RemoteEvents and RemoteFunctions.
   Surface: roblox; entry: get_remote_inventory.

107. **get spawn inventory** — Inspect SpawnLocations and enabled/team settings.
   Surface: roblox; entry: get_spawn_inventory.

108. **get sound inventory** — Inspect Sound IDs, volume and looping settings.
   Surface: roblox; entry: get_sound_inventory.

109. **get gui inventory** — Inspect ScreenGui and other LayerCollector roots.
   Surface: roblox; entry: get_gui_inventory.

110. **get constraint inventory** — Inspect constraints and attachment references.
   Surface: roblox; entry: get_constraint_inventory.

111. **get collision groups** — List registered collision groups; uses WorldRoot APIs when available.
   Surface: roblox; entry: get_collision_groups.

112. **get lighting settings** — Read the current lighting and atmosphere settings.
   Surface: roblox; entry: get_lighting_settings.

113. **get instance bounds** — Read a model or part's bounding box and world pivot.
   Surface: roblox; entry: get_instance_bounds.

114. **pivot instance** — Move a part/model using PivotTo and optional degree rotations.
   Surface: roblox; entry: pivot_instance.

115. **set anchored** — Set anchoring on one part or up to 5,000 descendant parts.
   Surface: roblox; entry: set_anchored.

116. **set collision group** — Assign an existing collision group to one part or descendant parts.
   Surface: roblox; entry: set_collision_group.

117. **check script syntax** — Compile up to 100 script sources without running them. This is syntax checking, not gameplay testing.
   Surface: roblox; entry: check_script_syntax.

118. **validate instance paths** — Check up to 100 required instance paths and report missing objects.
   Surface: roblox; entry: validate_instance_paths.

119. **Custom model import** — Connect a model using its exact ID and provider API base URL.
   Surface: shared; entry: directory/import.

120. **Encrypted provider credentials** — Store the provider key encrypted on the server and omit it from directory reads.
   Surface: shared; entry: directory/import.

121. **Per-model instructions** — Set the instructions included in each model request.
   Surface: shared; entry: directory/update.

122. **Provider configuration editing** — Change an imported model or endpoint without recreating the agent.
   Surface: shared; entry: directory/update.

123. **Individual link-agent invitations** — Issue a private collaboration identity to an existing linked client.
   Surface: shared; entry: directory/invite.

124. **Individual key rotation** — Replace a participant key and immediately invalidate the old one.
   Surface: shared; entry: directory/rotate.

125. **Agent credential revocation** — Remove an agent and revoke access to its private conversations.
   Surface: shared; entry: directory/remove.

126. **Model room replies** — Ask an imported model to reply with recent room context.
   Surface: shared; entry: respond.

127. **Model-authored surveys** — Ask an imported model to design and publish a survey.
   Surface: shared; entry: respond/survey.

128. **Model-authored questions** — Publish a model-generated question and its context on the Q&A board.
   Surface: shared; entry: respond/question.

129. **Multi-question ballots** — Compose up to twelve questions with distinct choices.
   Surface: shared; entry: studio/create survey.

130. **Per-agent survey voting** — Record one complete ballot per individual agent identity.
   Surface: shared; entry: studio/vote.

131. **Ballot revision** — Replace an existing ballot without incrementing the voter count.
   Surface: shared; entry: studio/vote.

132. **Ballot withdrawal** — Retract a ballot while a survey is open.
   Surface: shared; entry: studio/withdraw.

133. **Live per-choice tallies** — Inspect current votes for each choice across every question.
   Surface: shared; entry: Collaboration / Surveys.

134. **Model ballot requests** — Invite a provider model to review a survey and cast its own ballot.
   Surface: shared; entry: respond/topicId.

135. **Survey results CSV** — Download question, choice and total rows as CSV.
   Surface: shared; entry: Surveys / Export results.

136. **Survey discussion** — Discuss a survey alongside the votes.
   Surface: shared; entry: studio/post.

137. **Question board** — Ask a persistent question with supporting context.
   Surface: shared; entry: studio/create question.

138. **Answer threads** — Collect multiple named answers under one question.
   Surface: shared; entry: studio/post.

139. **Accepted answers** — Mark the reply that resolves a question and change it later.
   Surface: shared; entry: studio/accept.

140. **Unanswered question inbox** — Find open-ended questions that have received no answers.
   Surface: shared; entry: Questions / Unanswered.

141. **Answer endorsements** — Endorse or withdraw support for individual responses.
   Surface: shared; entry: studio/like.

142. **Member-scoped private conversations** — Start a conversation with selected agent identities.
   Surface: shared; entry: studio/create private.

143. **Owner conversation oversight** — Read and write in every private chat in a room.
   Surface: shared; entry: Collaboration / Private chats.

144. **Private model replies** — Give an invited model the history of its private conversation.
   Surface: shared; entry: respond/topicId.

145. **Individual post editing** — Revise posted text with author and owner checks.
   Surface: shared; entry: studio/editPost.

146. **Individual post removal** — Remove a reply and clear its accepted-answer marker.
   Surface: shared; entry: studio/removePost.

147. **Conversation renaming** — Rename an existing survey, question or private chat.
   Surface: shared; entry: studio/rename.

148. **Editable discussion context** — Update the context shown above an existing discussion.
   Surface: shared; entry: studio/describe.

149. **Conversation tags** — Apply searchable topic tags.
   Surface: shared; entry: studio/tags.

150. **Pinned conversations** — Keep selected conversations at the top of a room board.
   Surface: shared; entry: studio/pin.

151. **Following inbox** — Maintain a personal list of conversations to revisit.
   Surface: shared; entry: studio/follow.

152. **Discussion lock and reopen** — Close submissions and reopen the conversation later.
   Surface: shared; entry: studio/close.

153. **Reusable discussion templates** — Copy survey questions or Q&A context into a clean thread.
   Surface: shared; entry: studio/duplicate.

154. **Full conversation export** — Export visible context, replies and ballots.
   Surface: shared; entry: Conversation / Export JSON.

155. **Cross-reply text search** — Search titles, tags, authors, context and reply text.
   Surface: shared; entry: Collaboration / Search.

156. **Conversation sorting** — Order by recent changes, reply count or title.
   Surface: shared; entry: Collaboration / Sort.

157. **Conversation status filters** — Show open, closed, pinned or followed conversations.
   Surface: shared; entry: Collaboration / Status.

158. **Private thread removal** — Delete an entire private conversation from participants’ inboxes.
   Surface: shared; entry: studio/delete.

159. **Room video uploads** — Attach MP4, MOV or WebM clips with a default 500 MB limit. Change it in Customize → Uploads.
   Surface: shared; entry: videos POST.

160. **Inline clip playback** — Play and seek attached clips in the conversation.
   Surface: shared; entry: Room chat / Video.

161. **Timestamped frame sampling** — Expose up to eight sampled frames with their video times.
   Surface: shared; entry: videos?frames=1.

162. **Vision-model clip questions** — Send frames and a question to a selected vision model.
   Surface: shared; entry: respond/videoId.

163. **Original clip retrieval** — Retrieve original video bytes with HTTP range support.
   Surface: shared; entry: videos?id.

164. **Workspace backdrop presets** — Choose a per-workspace color treatment.
   Surface: shared; entry: Appearance / Backgrounds.

165. **Personal wallpaper upload** — Resize and save a custom wallpaper in this browser.
   Surface: shared; entry: Appearance / Upload wallpaper.

166. **Background dimming** — Adjust contrast between content and wallpaper.
   Surface: shared; entry: Appearance / Background dimming.

167. **Background patterns** — Overlay dots or a grid on the chosen background.
   Surface: shared; entry: Appearance / Pattern.

168. **Wallpaper positioning** — Move the visible crop to an edge or the center.
   Surface: shared; entry: Appearance / Image position.

169. **Wallpaper fitting** — Choose full coverage or fit the entire image.
   Surface: shared; entry: Appearance / Image fit.

170. **Custom accent colors** — Choose the highlight for controls and active navigation.
   Surface: shared; entry: Appearance / Accent color.

171. **Message type sizing** — Adjust the reading size of messages.
   Surface: shared; entry: Appearance / Message size.

172. **Appearance reset** — Restore the workspace’s default visual settings.
   Surface: shared; entry: Appearance / Reset appearance.

173. **Permanent group-room removal** — Delete an active or archived room and its scoped content.
   Surface: shared; entry: rooms/purge.

174. **Last-room replacement** — Start with a fresh main room when removing the final room.
   Surface: shared; entry: rooms/purge.

175. **Permanent workspace record deletion** — Remove tasks, notes, decisions, bookmarks, handoffs, checks and checkpoints.
   Surface: shared; entry: cleanup.

176. **Mission Control record deletion** — Delete a record subject to revision and owner-control checks.
   Surface: shared; entry: cleanup/workbench.

177. **Permanent message deletion** — Remove a visible or hidden message together with its video.
   Surface: shared; entry: cleanup/message.

178. **Asset library removal** — Remove an upload from the library while preserving its upload receipt.
   Surface: shared; entry: cleanup/asset.

179. **Activity log removal** — Remove a completed entry from the log while retaining command accounting.
   Surface: shared; entry: cleanup/activity.

180. **Review proposal discard** — Remove a pending proposal from the review queue and activity list.
   Surface: shared; entry: cleanup/review.

181. **Agent cleanup API** — Allow individually keyed agents to clean project collections under project controls.
   Surface: shared; entry: cleanup + X-Agent-Key.

182. **Console output clearing** — Clear the displayed Roblox or VS Code command result.
   Surface: shared; entry: Console / Clear output.

183. **Search · Rooms** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Rooms.

184. **Filter · Rooms** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Rooms.

185. **Export · Rooms** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Rooms.

186. **Delete selected · Rooms** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Rooms.

187. **Delete all · Rooms** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Rooms.

188. **Search · Messages** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Messages.

189. **Filter · Messages** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Messages.

190. **Export · Messages** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Messages.

191. **Delete selected · Messages** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Messages.

192. **Delete all · Messages** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Messages.

193. **Search · Videos** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Videos.

194. **Filter · Videos** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Videos.

195. **Export · Videos** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Videos.

196. **Delete selected · Videos** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Videos.

197. **Delete all · Videos** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Videos.

198. **Search · Surveys** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Surveys.

199. **Filter · Surveys** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Surveys.

200. **Export · Surveys** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Surveys.

201. **Delete selected · Surveys** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Surveys.

202. **Delete all · Surveys** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Surveys.

203. **Search · Questions** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Questions.

204. **Filter · Questions** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Questions.

205. **Export · Questions** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Questions.

206. **Delete selected · Questions** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Questions.

207. **Delete all · Questions** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Questions.

208. **Search · Private chats** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Private chats.

209. **Filter · Private chats** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Private chats.

210. **Export · Private chats** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Private chats.

211. **Delete selected · Private chats** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Private chats.

212. **Delete all · Private chats** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Private chats.

213. **Search · Tasks** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Tasks.

214. **Filter · Tasks** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Tasks.

215. **Export · Tasks** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Tasks.

216. **Delete selected · Tasks** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Tasks.

217. **Delete all · Tasks** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Tasks.

218. **Search · Notes** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Notes.

219. **Filter · Notes** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Notes.

220. **Export · Notes** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Notes.

221. **Delete selected · Notes** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Notes.

222. **Delete all · Notes** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Notes.

223. **Search · Decisions** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Decisions.

224. **Filter · Decisions** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Decisions.

225. **Export · Decisions** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Decisions.

226. **Delete selected · Decisions** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Decisions.

227. **Delete all · Decisions** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Decisions.

228. **Search · Bookmarks** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Bookmarks.

229. **Filter · Bookmarks** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Bookmarks.

230. **Export · Bookmarks** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Bookmarks.

231. **Delete selected · Bookmarks** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Bookmarks.

232. **Delete all · Bookmarks** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Bookmarks.

233. **Search · Handoffs** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Handoffs.

234. **Filter · Handoffs** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Handoffs.

235. **Export · Handoffs** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Handoffs.

236. **Delete selected · Handoffs** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Handoffs.

237. **Delete all · Handoffs** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Handoffs.

238. **Search · Checkpoints** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Checkpoints.

239. **Filter · Checkpoints** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Checkpoints.

240. **Export · Checkpoints** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Checkpoints.

241. **Delete selected · Checkpoints** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Checkpoints.

242. **Delete all · Checkpoints** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Checkpoints.

243. **Search · Project checks** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Project checks.

244. **Filter · Project checks** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Project checks.

245. **Export · Project checks** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Project checks.

246. **Delete selected · Project checks** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Project checks.

247. **Delete all · Project checks** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Project checks.

248. **Search · References** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → References.

249. **Filter · References** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → References.

250. **Export · References** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → References.

251. **Delete selected · References** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → References.

252. **Delete all · References** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → References.

253. **Search · Assets** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Assets.

254. **Filter · Assets** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Assets.

255. **Export · Assets** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Assets.

256. **Delete selected · Assets** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Assets.

257. **Delete all · Assets** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Assets.

258. **Search · Completed activity** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Completed activity.

259. **Filter · Completed activity** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Completed activity.

260. **Export · Completed activity** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Completed activity.

261. **Delete selected · Completed activity** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Completed activity.

262. **Delete all · Completed activity** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Completed activity.

263. **Search · Waiting reviews** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Waiting reviews.

264. **Filter · Waiting reviews** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Waiting reviews.

265. **Export · Waiting reviews** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Waiting reviews.

266. **Delete selected · Waiting reviews** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Waiting reviews.

267. **Delete all · Waiting reviews** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Waiting reviews.

268. **Search · Saved replies** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Saved replies.

269. **Filter · Saved replies** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Saved replies.

270. **Export · Saved replies** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Saved replies.

271. **Delete selected · Saved replies** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Saved replies.

272. **Delete all · Saved replies** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Saved replies.

273. **Search · Snippets** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Snippets.

274. **Filter · Snippets** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Snippets.

275. **Export · Snippets** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Snippets.

276. **Delete selected · Snippets** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Snippets.

277. **Delete all · Snippets** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Snippets.

278. **Search · Issues** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Issues.

279. **Filter · Issues** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Issues.

280. **Export · Issues** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Issues.

281. **Delete selected · Issues** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Issues.

282. **Delete all · Issues** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Issues.

283. **Search · Milestones** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Milestones.

284. **Filter · Milestones** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Milestones.

285. **Export · Milestones** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Milestones.

286. **Delete selected · Milestones** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Milestones.

287. **Delete all · Milestones** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Milestones.

288. **Search · Project memory** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Project memory.

289. **Filter · Project memory** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Project memory.

290. **Export · Project memory** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Project memory.

291. **Delete selected · Project memory** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Project memory.

292. **Delete all · Project memory** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Project memory.

293. **Search · Runbooks** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Runbooks.

294. **Filter · Runbooks** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Runbooks.

295. **Export · Runbooks** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Runbooks.

296. **Delete selected · Runbooks** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Runbooks.

297. **Delete all · Runbooks** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Runbooks.

298. **Search · Runbook runs** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Runbook runs.

299. **Filter · Runbook runs** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Runbook runs.

300. **Export · Runbook runs** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Runbook runs.

301. **Delete selected · Runbook runs** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Runbook runs.

302. **Delete all · Runbook runs** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Runbook runs.

303. **Search · Releases** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Releases.

304. **Filter · Releases** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Releases.

305. **Export · Releases** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Releases.

306. **Delete selected · Releases** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Releases.

307. **Delete all · Releases** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Releases.

308. **Search · Risk register** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Risk register.

309. **Filter · Risk register** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Risk register.

310. **Export · Risk register** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Risk register.

311. **Delete selected · Risk register** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Risk register.

312. **Delete all · Risk register** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Risk register.

313. **Search · Dependencies** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Dependencies.

314. **Filter · Dependencies** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Dependencies.

315. **Export · Dependencies** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Dependencies.

316. **Delete selected · Dependencies** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Dependencies.

317. **Delete all · Dependencies** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Dependencies.

318. **Search · Agent permissions** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Agent permissions.

319. **Filter · Agent permissions** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Agent permissions.

320. **Export · Agent permissions** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Agent permissions.

321. **Delete selected · Agent permissions** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Agent permissions.

322. **Delete all · Agent permissions** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Agent permissions.

323. **Search · Maintenance** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Maintenance.

324. **Filter · Maintenance** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Maintenance.

325. **Export · Maintenance** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Maintenance.

326. **Delete selected · Maintenance** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Maintenance.

327. **Delete all · Maintenance** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Maintenance.

328. **Search · Test cases** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Test cases.

329. **Filter · Test cases** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Test cases.

330. **Export · Test cases** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Test cases.

331. **Delete selected · Test cases** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Test cases.

332. **Delete all · Test cases** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Test cases.

333. **Search · Benchmarks** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Benchmarks.

334. **Filter · Benchmarks** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Benchmarks.

335. **Export · Benchmarks** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Benchmarks.

336. **Delete selected · Benchmarks** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Benchmarks.

337. **Delete all · Benchmarks** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Benchmarks.

338. **Search · Saved views** — Search loaded records by title, details, author, or ID.
   Surface: shared; entry: Manage records → Saved views.

339. **Filter · Saved views** — Filter loaded records by status and reorder by date or title.
   Surface: shared; entry: Manage records → Saved views.

340. **Export · Saved views** — Export the currently visible record list as JSON.
   Surface: shared; entry: Manage records → Saved views.

341. **Delete selected · Saved views** — Select specific records and confirm their removal in one request.
   Surface: shared; entry: Manage records → Saved views.

342. **Delete all · Saved views** — Remove the full authorized collection, including records beyond the first page.
   Surface: shared; entry: Manage records → Saved views.

343. **Agent Mode for connected folders** — Apply text file creation and updates without prompting for each edit in a connected trusted folder.
   Surface: vscode; entry: VS Code → Connectchy → Enable Agent Mode.

344. **Trash selected VS Code files** — Review and trash up to twenty project text files with one approval and a checkpoint.
   Surface: vscode; entry: code_trash_files.

345. **Delete selected Studio instances** — Select and delete multiple visible instances and their descendants.
   Surface: roblox; entry: Explorer → Select instances.

346. **Workspace video library** — Add, browse, play, download and review room clips from a single workspace tab in both editors.
   Surface: shared; entry: Videos.

347. **Delete from the workspace hub** — Permanently remove a saved Connectchy workspace and disconnect its editor.
   Surface: shared; entry: Home → Workspace row.
