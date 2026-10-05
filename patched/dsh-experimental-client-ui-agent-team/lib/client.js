window.__ModuleLoader__.load({
	id: "@deepseek-ai/dsh-experimental-client-ui-agent-team",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let react_dom = require("react-dom");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region \0dsh-css:D:\qwq\desktop\wt-dsh-master\deepseek-harness\packages\experimental\client-ui-agent-team\src\client\TeamAction.module.css.mjs
		const css = ".wNJJ9a_root{position:relative}.wNJJ9a_trigger{min-height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;border-radius:6px;align-items:center;gap:5px;padding:3px 7px;font-size:12px;display:inline-flex}.wNJJ9a_trigger:hover,.wNJJ9a_trigger:focus-visible{color:var(--dsw-alias-label-primary)}@container (width<=480px){.wNJJ9a_triggerLabel{display:none}}.wNJJ9a_count{color:var(--dsw-alias-label-caption);font-variant-numeric:tabular-nums;font-size:12px;font-weight:400;line-height:16px}.wNJJ9a_panel{--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2);z-index:100;box-sizing:border-box;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:min(500px,100vw - 32px);max-height:min(680px,100vh - 32px);box-shadow:var(--dsw-elevation-prominent);border:0;border-radius:12px;flex-direction:column;padding:8px 2px 0;display:flex;position:fixed;overflow:hidden}.wNJJ9a_panel:before{content:\"\";z-index:-1;background:var(--dsw-specific-menu);backdrop-filter:var(--dsw-menu-backdrop-filter);border-radius:12px;position:absolute;inset:0}.wNJJ9a_panelCompact{width:min(320px,100vw - 32px)}.wNJJ9a_panelCompact .wNJJ9a_roster{grid-template-columns:minmax(0,1fr)}.wNJJ9a_body{--dsh-scrollbar-track-margin:8px;scrollbar-gutter:stable;flex:auto;min-height:0;padding:0 9px 16px 14px;overflow-y:auto}.wNJJ9a_taskTitle{align-items:center;gap:8px;display:flex}.wNJJ9a_taskTitle strong{font-size:13px;font-weight:500}.wNJJ9a_panel h3{color:var(--dsw-alias-label-primary);align-items:center;gap:8px;margin:16px 0 8px 4px;font-size:13px;font-weight:500;display:flex}.wNJJ9a_body section:first-of-type h3{margin-top:8px}.wNJJ9a_roster{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;display:grid}.wNJJ9a_member{--dsw-elevation-stroke-color:var(--dsw-alias-border-l2);min-width:0;box-shadow:var(--dsw-elevation-stroke);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer;border:0;border-radius:8px;align-items:flex-start;gap:8px;padding:10px 12px;display:flex}.wNJJ9a_member:disabled{cursor:default}.wNJJ9a_memberCurrent{--dsw-elevation-stroke-color:color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent);box-shadow:var(--dsw-elevation-stroke), inset 0 0 0 1px color-mix(in srgb, var(--dsw-alias-state-business-primary) 40%, transparent)}.wNJJ9a_member:not(:disabled):hover,.wNJJ9a_member:not(:disabled):focus-visible{--dsw-elevation-stroke-color:var(--dsw-alias-border-l3);box-shadow:var(--dsw-elevation-panel)}.wNJJ9a_memberDot{flex:none;align-items:center;height:1lh;display:inline-flex}.wNJJ9a_inactiveIcon{color:var(--dsw-alias-label-tertiary)}.wNJJ9a_memberText{flex-direction:column;min-width:0;display:flex}.wNJJ9a_memberName{align-items:center;gap:5px;min-width:0;display:inline-flex}.wNJJ9a_memberNameText,.wNJJ9a_memberText small{white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.wNJJ9a_memberModel{display:none}.wNJJ9a_member:hover .wNJJ9a_memberModel,.wNJJ9a_member:focus-visible .wNJJ9a_memberModel{display:inline}.wNJJ9a_currentTag{text-overflow:ellipsis;flex:0 999 auto;min-width:0;padding:0 4px;font-size:10px;line-height:15px;display:inline-block;overflow:hidden}.wNJJ9a_memberText small,.wNJJ9a_meta{color:var(--dsw-alias-label-tertiary);font-size:11px}.wNJJ9a_diagnostic,.wNJJ9a_error,.wNJJ9a_warning{color:var(--dsw-alias-state-error-primary)}.wNJJ9a_tasks{flex-direction:column;gap:7px;display:flex}.wNJJ9a_emptyNotice{color:var(--dsw-alias-label-tertiary);margin:16px 0 0 4px;font-size:12px}.wNJJ9a_task{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);border-radius:9px;padding:11px 13px}.wNJJ9a_taskState{color:var(--dsw-alias-label-tertiary);align-items:center;gap:6px;margin-left:auto;font-size:11px;display:inline-flex}.wNJJ9a_task p{color:var(--dsw-alias-label-secondary);white-space:pre-wrap;margin:5px 0;font-size:12px;line-height:18px}.wNJJ9a_clampedDescription{-webkit-line-clamp:2;-webkit-box-orient:vertical;display:-webkit-box;overflow:hidden}.wNJJ9a_expandToggle{float:right;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:0;align-items:center;gap:2px;margin-left:10px;padding:0;font-size:11px;line-height:20px;display:inline-flex}.wNJJ9a_expandToggle:hover,.wNJJ9a_expandToggle:focus-visible{color:var(--dsw-alias-label-primary)}.wNJJ9a_expandToggle svg{transition:transform .12s}.wNJJ9a_expandToggleOpen{transform:rotate(180deg)}.wNJJ9a_meta{line-height:20px}.wNJJ9a_meta>span{margin-right:10px}.wNJJ9a_notice,.wNJJ9a_error{align-items:center;gap:6px;padding:9px;font-size:12px;display:flex}";
		const tagId = "@deepseek-ai/dsh-experimental-client-ui-agent-team/TeamAction.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@deepseek-ai/dsh-experimental-client-ui-agent-team";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var TeamAction_module_css_default = {
			"body": "wNJJ9a_body",
			"clampedDescription": "wNJJ9a_clampedDescription",
			"count": "wNJJ9a_count",
			"currentTag": "wNJJ9a_currentTag",
			"diagnostic": "wNJJ9a_diagnostic",
			"emptyNotice": "wNJJ9a_emptyNotice",
			"error": "wNJJ9a_error",
			"expandToggle": "wNJJ9a_expandToggle",
			"expandToggleOpen": "wNJJ9a_expandToggleOpen",
			"inactiveIcon": "wNJJ9a_inactiveIcon",
			"member": "wNJJ9a_member",
			"memberCurrent": "wNJJ9a_memberCurrent",
			"memberDot": "wNJJ9a_memberDot",
			"memberModel": "wNJJ9a_memberModel",
			"memberName": "wNJJ9a_memberName",
			"memberNameText": "wNJJ9a_memberNameText",
			"memberText": "wNJJ9a_memberText",
			"meta": "wNJJ9a_meta",
			"notice": "wNJJ9a_notice",
			"panel": "wNJJ9a_panel",
			"panelCompact": "wNJJ9a_panelCompact",
			"root": "wNJJ9a_root",
			"roster": "wNJJ9a_roster",
			"task": "wNJJ9a_task",
			"taskState": "wNJJ9a_taskState",
			"taskTitle": "wNJJ9a_taskTitle",
			"tasks": "wNJJ9a_tasks",
			"trigger": "wNJJ9a_trigger",
			"triggerLabel": "wNJJ9a_triggerLabel",
			"warning": "wNJJ9a_warning"
		};
		//#endregion
		//#region lib/types/client/TeamAction.js
		function statusKey(status) {
			switch (status) {
				case "pending": return "status.pending";
				case "in_progress": return "status.in_progress";
				case "completed": return "status.completed";
				/* v8 ignore next -- Team views omit deleted task tombstones. */
				case "deleted": return "status.completed";
			}
		}
		function memberStatusKey(status) {
			switch (status) {
				case "running": return "memberStatus.running";
				case "inactive": return "memberStatus.inactive";
				case "provisioning": return "memberStatus.provisioning";
				case "failed": return "memberStatus.failed";
				/* v8 ignore next -- an unknown phase still renders its raw state text. */
				default: return status;
			}
		}
		function memberDotState(status) {
			switch (status) {
				case "running":
				case "provisioning": return "ongoing";
				case "failed": return "error";
				/* v8 ignore next -- an unknown phase still renders an idle dot. */
				default: return "idle";
			}
		}
		function taskDotState(task) {
			switch (task.status) {
				case "pending": return task.ready ? "idle" : "warning";
				case "in_progress": return "ongoing";
				case "completed": return "done";
				/* v8 ignore next -- Team views omit deleted task tombstones. */
				case "deleted": return "idle";
			}
		}
		/** `provider/model` identity of one projected model selection, or "" when none is known. */
		function routeKey(selection) {
			if (selection?.provider === void 0 || selection.model === void 0) return "";
			return `${selection.provider}/${selection.model}`;
		}
		/** Flatten the Host model catalog into `provider/model` option values. */
		function modelChoices(groups) {
			const choices = [];
			for (const group of groups ?? []) for (const model of group.models ?? []) choices.push({
				value: `${group.id}/${model.id}`,
				label: `${group.id} · ${model.id}`
			});
			return choices;
		}
		/** Shared inline styling for the roster management affordances. */
		const controlStyle = {
			fontSize: 11,
			padding: "2px 6px",
			borderRadius: 6,
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "var(--dsw-alias-bg-layer-2)",
			color: "var(--dsw-alias-label-secondary)"
		};
		function TeamMemberRow({ member, memberCount, sessionId, useSessions, useSessionStatus, openTeammate, catalog, retireMember, selectMemberModel, onError, t }) {
			const selection = useSessions((state) => state.projectionsBySession[member.id]?.values.modelSelection?.next);
			const model = selection?.model;
			const running = useSessionStatus((state) => state.get(member.id)?.running);
			const summaryRunning = useSessions((state) => state.byId[member.id]?.running);
			const status = member.phase === "active" ? (running ?? summaryRunning) === true ? "running" : "inactive" : member.phase;
			const isCurrent = member.id === sessionId;
			const highlightCurrent = isCurrent && memberCount > 1;
			const inert = isCurrent || status === "failed" || status === "provisioning";
			const isLead = member.role === "lead";
			const [retiring, setRetiring] = (0, react.useState)(false);
			const [changing, setChanging] = (0, react.useState)(false);
			const [pending, setPending] = (0, react.useState)(null);
			const retire = async () => {
				setRetiring(true);
				try {
					const failure = await retireMember(member.name);
					if (failure !== void 0) onError(failure);
				} finally {
					setRetiring(false);
				}
			};
			// A teammate's model is fixed when its subagent Session is created, so
			// re-routing one retires it and rebuilds it under the same name. That loses
			// the live conversation, so the pick waits for an explicit confirmation.
			const changeModel = (value) => {
				if (value === "" || value === routeKey(selection)) return;
				const separator = value.indexOf("/");
				const provider = value.slice(0, separator);
				const model = value.slice(separator + 1);
				setPending({
					provider,
					model,
					label: `${provider} · ${model}`
				});
			};
			const applyModelChange = async () => {
				setChanging(true);
				try {
					const failure = await selectMemberModel(member.name, {
						provider: pending.provider,
						model: pending.model
					});
					if (failure !== void 0) onError(failure);
					else setPending(null);
				} finally {
					setChanging(false);
				}
			};
			const controls = isLead ? false : (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: 6,
					padding: "0 4px 6px"
				},
				children: [pending === null ? (0, react_jsx_runtime.jsxs)("select", {
					"aria-label": t("memberModel"),
					title: t("memberModel"),
					value: routeKey(selection),
					disabled: changing,
					onChange: (event) => void changeModel(event.target.value),
					style: {
						...controlStyle,
						flex: "1 1 auto",
						minWidth: 0
					},
					children: [(0, react_jsx_runtime.jsx)("option", {
						value: "",
						children: t("memberModelDefault")
					}), modelChoices(catalog).map((choice) => (0, react_jsx_runtime.jsx)("option", {
						value: choice.value,
						children: choice.label
					}, choice.value))]
				}) : (0, react_jsx_runtime.jsx)("span", {
					title: t("memberModelRebuild"),
					style: {
						...controlStyle,
						flex: "1 1 auto",
						minWidth: 0,
						overflow: "hidden",
						textOverflow: "ellipsis",
						whiteSpace: "nowrap"
					},
					children: `${t("memberModelRebuild")} ${pending.label}`
				}), pending === null ? (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: retiring,
					title: t("memberRetire"),
					onClick: () => void retire(),
					style: {
						...controlStyle,
						cursor: "pointer"
					},
					children: retiring ? t("memberRetiring") : t("memberRetire")
				}) : (0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "flex",
						gap: 6
					},
					children: [(0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: changing,
						title: t("memberModelConfirm"),
						onClick: () => void applyModelChange(),
						style: {
							...controlStyle,
							cursor: "pointer"
						},
						children: changing ? t("memberModelSwitching") : t("memberModelConfirm")
					}), (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						disabled: changing,
						title: t("memberModelCancel"),
						onClick: () => setPending(null),
						style: {
							...controlStyle,
							cursor: "pointer"
						},
						children: t("memberModelCancel")
					})]
				})]
			});
			return (0, react_jsx_runtime.jsxs)("div", {
				style: {
					minWidth: 0,
					display: "flex",
					flexDirection: "column"
				},
				children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
					label: t("open"),
				side: "bottom",
				gap: 4,
				disabled: inert,
				children: (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: highlightCurrent ? `${TeamAction_module_css_default.member} ${TeamAction_module_css_default.memberCurrent}` : TeamAction_module_css_default.member,
					disabled: inert,
					onClick: () => {
						try {
							openTeammate(sessionId, member.id);
						} catch (reason) {
							onError(String(reason));
						}
					},
					children: [(0, react_jsx_runtime.jsx)("span", {
						className: TeamAction_module_css_default.memberDot,
						children: status === "inactive" ? (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUserOutlineRegular, {
							size: 14,
							className: TeamAction_module_css_default.inactiveIcon
						}) : (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: memberDotState(status) })
					}), (0, react_jsx_runtime.jsxs)("span", {
						className: TeamAction_module_css_default.memberText,
						children: [
							(0, react_jsx_runtime.jsxs)("span", {
								className: TeamAction_module_css_default.memberName,
								children: [(0, react_jsx_runtime.jsx)("span", {
									className: TeamAction_module_css_default.memberNameText,
									children: member.name
								}), isCurrent && (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tag, {
									tone: "info",
									className: TeamAction_module_css_default.currentTag,
									children: t("current")
								})]
							}),
							(0, react_jsx_runtime.jsxs)("small", { children: [t(memberStatusKey(status)), model !== void 0 && (0, react_jsx_runtime.jsx)("span", {
								className: TeamAction_module_css_default.memberModel,
								children: ` · ${t("model")}: ${model}`
							})] }),
							member.error !== void 0 && (0, react_jsx_runtime.jsx)("small", {
								className: TeamAction_module_css_default.diagnostic,
								children: member.error
							})
						]
					})]
				})
			}), controls]
			});
		}
		/** Task card with a two-line description clamp expanded from a toggle in the meta row. */
		function TaskCard({ task, t }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [clamped, setClamped] = (0, react.useState)(false);
			const textRef = (0, react.useRef)(null);
			(0, react.useLayoutEffect)(() => {
				if (expanded) return;
				const paragraph = textRef.current;
				/* v8 ignore next -- the paragraph mounts in the same commit as the effect. */
				if (paragraph === null) return;
				const measure = () => {
					setClamped(paragraph.scrollHeight > paragraph.clientHeight + 1);
				};
				measure();
				if (typeof ResizeObserver === "undefined") return;
				const observer = new ResizeObserver(measure);
				observer.observe(paragraph);
				return () => {
					observer.disconnect();
				};
			}, [task.description, expanded]);
			return (0, react_jsx_runtime.jsxs)("article", {
				className: TeamAction_module_css_default.task,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: TeamAction_module_css_default.taskTitle,
						children: [(0, react_jsx_runtime.jsx)("strong", { children: task.subject }), (0, react_jsx_runtime.jsxs)("span", {
							className: TeamAction_module_css_default.taskState,
							children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: taskDotState(task) }), (0, react_jsx_runtime.jsx)("span", { children: t(statusKey(task.status)) })]
						})]
					}),
					(0, react_jsx_runtime.jsx)("p", {
						ref: textRef,
						className: expanded ? void 0 : TeamAction_module_css_default.clampedDescription,
						children: task.description
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: TeamAction_module_css_default.meta,
						children: [
							(clamped || expanded) && (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: TeamAction_module_css_default.expandToggle,
								"aria-expanded": expanded,
								onClick: () => {
									setExpanded((current) => !current);
								},
								children: [t(expanded ? "task.collapse" : "task.expand"), (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutlineRegular, {
									size: 12,
									className: expanded ? TeamAction_module_css_default.expandToggleOpen : void 0
								})]
							}),
							(0, react_jsx_runtime.jsx)("span", { children: task.id }),
							(0, react_jsx_runtime.jsxs)("span", { children: [
								t("owner"),
								": ",
								task.ownerName ?? t("unowned")
							] }),
							task.status === "pending" && (0, react_jsx_runtime.jsx)("span", { children: task.ready ? t("ready") : t("blocked") }),
							task.blockedBy.length > 0 && (0, react_jsx_runtime.jsxs)("span", { children: [
								t("blockedBy"),
								": ",
								task.blockedBy.join(", ")
							] }),
							task.writeScopes.length > 0 && (0, react_jsx_runtime.jsxs)("span", { children: [
								t("writeScopes"),
								": ",
								task.writeScopes.join(", ")
							] }),
							task.writeScopeWarnings.map((warning) => (0, react_jsx_runtime.jsx)("span", {
								className: TeamAction_module_css_default.warning,
								children: warning
							}, warning))
						]
					})
				]
			});
		}
		/** Render the Team roster and read-only task board. */
		function TeamAction({ sessionId, useSession, useSessions, useSessionStatus, openTeammate, loadModels, runTeamCommand, t }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [catalog, setCatalog] = (0, react.useState)([]);
			const [adding, setAdding] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [draft, setDraft] = (0, react.useState)({
				name: "",
				task: "",
				model: "",
				fork: false
			});
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const triggerLabelRef = (0, react.useRef)(null);
			const panelRef = (0, react.useRef)(null);
			const position = (0, _deepseek_ai_dsh_client_ui_primitives.useAnchoredPosition)({
				open,
				anchorRef: triggerRef,
				panelRef,
				gap: 5,
				margin: 16
			});
			const positioned = position !== null;
			const leadSessionId = useSession((snapshot) => snapshot.subagent?.address.parentSessionId) ?? sessionId;
			const team = useSessions((state) => state.projectionsBySession[leadSessionId]?.values.agentTeam);
			const opening = useSession((snapshot) => snapshot.openState === "loading");
			const listing = useSessions((state) => state.phase === "pending");
			const hoverTimer = (0, react.useRef)(void 0);
			const pinnedRef = (0, react.useRef)(false);
			const cancelHoverChange = () => {
				clearTimeout(hoverTimer.current);
				hoverTimer.current = void 0;
			};
			(0, react.useEffect)(() => {
				cancelHoverChange();
				pinnedRef.current = false;
				setOpen(false);
				setError(null);
			}, [sessionId]);
			(0, react.useEffect)(() => cancelHoverChange, []);
			(0, react.useLayoutEffect)(() => {
				if (open && positioned && pinnedRef.current) panelRef.current?.focus();
			}, [open, positioned]);
			const changeOpen = (next) => {
				cancelHoverChange();
				if (!next) pinnedRef.current = false;
				setOpen(next);
			};
			const scheduleHoverOpen = () => {
				cancelHoverChange();
				if (open) return;
				const label = triggerLabelRef.current;
				/* v8 ignore next -- the label mounts with the trigger that received the hover. */
				if (label === null) return;
				if (getComputedStyle(label).display === "none") return;
				hoverTimer.current = setTimeout(() => {
					hoverTimer.current = void 0;
					changeOpen(true);
				}, 150);
			};
			const scheduleHoverClose = () => {
				cancelHoverChange();
				if (pinnedRef.current) return;
				hoverTimer.current = setTimeout(() => {
					hoverTimer.current = void 0;
					changeOpen(false);
				}, 120);
			};
			(0, _deepseek_ai_dsh_client_ui_primitives.useDismissOnOutsidePointer)(rootRef, open, changeOpen, panelRef);
			(0, react.useEffect)(() => {
				if (!open) return;
				const dismiss = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					cancelHoverChange();
					pinnedRef.current = false;
					setOpen(false);
					if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
				};
				document.addEventListener("keydown", dismiss);
				return () => {
					document.removeEventListener("keydown", dismiss);
				};
			}, [open]);
			(0, react.useEffect)(() => {
				if (!open) return;
				let live = true;
				loadModels().then((groups) => {
					if (live) setCatalog(groups);
				}).catch(() => {});
				return () => {
					live = false;
				};
			}, [open]);
			const retireMember = async (name) => {
				const result = await runTeamCommand(leadSessionId, `/team retire ${name}`);
				return result.kind === "error" ? result.text : void 0;
			};
			const selectMemberModel = async (name, selection) => {
				try {
					const result = await runTeamCommand(leadSessionId, `/team model ${name} ${selection.provider}/${selection.model}`);
					return result.kind === "error" ? result.text : void 0;
				} catch (reason) {
					return String(reason);
				}
			};
			const submitAdd = async () => {
				const name = draft.name.trim();
				const task = draft.task.trim();
				if (name === "" || task === "") {
					setError(t("addMissing"));
					return;
				}
				setBusy(true);
				try {
					const result = await runTeamCommand(leadSessionId, `/team add ${name}${draft.fork ? " --fork" : ""}${draft.model === "" ? "" : ` --model ${draft.model}`} -- ${task}`);
					if (result.kind === "error") setError(result.text);
					else {
						setError(null);
						setDraft({
							name: "",
							task: "",
							model: "",
							fork: false
						});
						setAdding(false);
					}
				} catch (reason) {
					setError(String(reason));
				} finally {
					setBusy(false);
				}
			};
			const fieldStyle = {
				...controlStyle,
				width: "100%",
				boxSizing: "border-box"
			};
			const addForm = (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 6,
					marginTop: 10,
					padding: "0 4px"
				},
				children: [(0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => setAdding(!adding),
					style: {
						...controlStyle,
						alignSelf: "flex-start",
						cursor: "pointer"
					},
					children: adding ? t("addClose") : t("addOpen")
				}), adding && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("input", {
					value: draft.name,
					placeholder: t("addName"),
					onChange: (event) => setDraft({
						...draft,
						name: event.target.value
					}),
					style: fieldStyle
				}), (0, react_jsx_runtime.jsx)("textarea", {
					value: draft.task,
					placeholder: t("addTask"),
					rows: 3,
					onChange: (event) => setDraft({
						...draft,
						task: event.target.value
					}),
					style: fieldStyle
				}), (0, react_jsx_runtime.jsxs)("select", {
					value: draft.model,
					"aria-label": t("addModel"),
					onChange: (event) => setDraft({
						...draft,
						model: event.target.value
					}),
					style: fieldStyle,
					children: [(0, react_jsx_runtime.jsx)("option", {
						value: "",
						children: t("addModelDefault")
					}), modelChoices(catalog).map((choice) => (0, react_jsx_runtime.jsx)("option", {
						value: choice.value,
						children: choice.label
					}, choice.value))]
				}), (0, react_jsx_runtime.jsxs)("label", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: 6,
						fontSize: 11,
						color: "var(--dsw-alias-label-secondary)"
					},
					children: [(0, react_jsx_runtime.jsx)("input", {
						type: "checkbox",
						checked: draft.fork,
						onChange: (event) => setDraft({
							...draft,
							fork: event.target.checked
						})
					}), t("addFork")]
				}), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					disabled: busy,
					onClick: () => void submitAdd(),
					style: {
						...controlStyle,
						alignSelf: "flex-start",
						cursor: "pointer"
					},
					children: busy ? t("addBusy") : t("addSubmit")
				})] })]
			});
			const compact = team !== void 0 && team.members.length === 1 && team.tasks.length === 0;
			return (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: TeamAction_module_css_default.root,
				"data-team-action": true,
				onMouseLeave: scheduleHoverClose,
				children: [(0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					ref: triggerRef,
					onMouseEnter: scheduleHoverOpen,
					className: TeamAction_module_css_default.trigger,
					"aria-label": t("trigger"),
					"aria-haspopup": "dialog",
					"aria-expanded": open,
					onClick: () => {
						cancelHoverChange();
						pinnedRef.current = true;
						if (!open) changeOpen(true);
						else panelRef.current?.focus();
					},
					children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconUsersOutlineRegular, { size: 14 }), (0, react_jsx_runtime.jsx)("span", {
						ref: triggerLabelRef,
						className: TeamAction_module_css_default.triggerLabel,
						children: t("trigger")
					})]
				}), open && (0, react_dom.createPortal)((0, react_jsx_runtime.jsx)("div", {
					ref: panelRef,
					className: compact ? `${TeamAction_module_css_default.panel} ${TeamAction_module_css_default.panelCompact}` : TeamAction_module_css_default.panel,
					style: position ?? {
						visibility: "hidden",
						left: 0,
						top: 0
					},
					role: "dialog",
					tabIndex: -1,
					"aria-label": t("trigger"),
					"data-team-panel": true,
					onMouseEnter: cancelHoverChange,
					onMouseLeave: scheduleHoverClose,
					children: (0, react_jsx_runtime.jsxs)("div", {
						className: TeamAction_module_css_default.body,
						children: [
							error !== null && (0, react_jsx_runtime.jsxs)("div", {
								className: TeamAction_module_css_default.error,
								role: "alert",
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), error]
							}),
							team === void 0 && (0, react_jsx_runtime.jsxs)("div", {
								className: TeamAction_module_css_default.notice,
								role: "status",
								children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: opening || listing ? "ongoing" : "warning" }), t(opening || listing ? "loading" : "unavailable")]
							}),
							team !== void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								team.failure !== void 0 && (0, react_jsx_runtime.jsxs)("div", {
									className: TeamAction_module_css_default.error,
									role: "alert",
									children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" }), t("failure", { message: team.failure })]
								}),
								(0, react_jsx_runtime.jsxs)("section", { children: [(0, react_jsx_runtime.jsxs)("h3", { children: [t("roster"), team.members.length > 1 && (0, react_jsx_runtime.jsx)("span", {
									className: TeamAction_module_css_default.count,
									children: team.members.length
								})] }), (0, react_jsx_runtime.jsx)("div", {
									className: TeamAction_module_css_default.roster,
									children: team.members.map((member) => (0, react_jsx_runtime.jsx)(TeamMemberRow, {
										member,
										memberCount: team.members.length,
										sessionId,
										useSessions,
										useSessionStatus,
										openTeammate,
										catalog,
										retireMember,
										selectMemberModel,
										onError: setError,
										t
									}, member.id))
								}), addForm] }),
								(0, react_jsx_runtime.jsx)("section", { children: team.tasks.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
									className: TeamAction_module_css_default.emptyNotice,
									children: t("empty")
								}) : (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("h3", { children: [t("tasks"), (0, react_jsx_runtime.jsx)("span", {
									className: TeamAction_module_css_default.count,
									children: team.tasks.length
								})] }), (0, react_jsx_runtime.jsx)("div", {
									className: TeamAction_module_css_default.tasks,
									children: team.tasks.map((task) => (0, react_jsx_runtime.jsx)(TaskCard, {
										task,
										t
									}, task.id))
								})] }) })
							] })
						]
					})
				}), document.body)]
			});
		}
		//#endregion
		//#region lib/types/client/locales.js
		/** Agent Teams Web dictionaries. */
		/** Locale namespace owned by the Agent Teams Web UI. */
		const NS = "agent-team";
		/** Simplified Chinese dictionary and key source. */
		const zh = {
			trigger: "智能体团队",
			loading: "正在加载团队…",
			unavailable: "Team 暂不可用",
			failure: "团队持久记录无效：{message}",
			empty: "暂无共享任务，可以通过对话创建",
			roster: "成员",
			tasks: "共享任务",
			model: "模型",
			open: "打开成员会话",
			current: "当前会话",
			owner: "Owner",
			unowned: "未分配",
			blockedBy: "依赖",
			writeScopes: "写入范围",
			ready: "可开始",
			blocked: "被依赖阻塞",
			"task.expand": "展开",
			"task.collapse": "收起",
			"memberStatus.running": "运行中",
			"memberStatus.inactive": "未运行",
			"memberStatus.provisioning": "准备中",
			"memberStatus.failed": "失败",
			addOpen: "添加队友",
			addClose: "收起",
			addName: "队友名字",
			addTask: "初始任务",
			addModel: "模型",
			addModelDefault: "与 Lead 相同",
			addFork: "继承 Lead 的上下文",
			addSubmit: "创建队友",
			addBusy: "正在创建…",
			addMissing: "需要名字和初始任务",
			memberModel: "切换该队友的模型",
			memberModelDefault: "默认模型",
			memberModelRebuild: "换模型会重建该队友：",
			memberModelConfirm: "重建",
			memberModelSwitching: "重建中…",
			memberModelCancel: "取消",
			memberRetire: "退休",
			memberRetiring: "退休中…",
			"status.pending": "待处理",
			"status.in_progress": "进行中",
			"status.completed": "已完成"
		};
		/** English dictionary checked against the Chinese key set. */
		const en = {
			trigger: "Agent Team",
			loading: "Loading Team…",
			unavailable: "Team is unavailable",
			failure: "Invalid persisted Team record: {message}",
			empty: "No shared tasks yet. Create them through the conversation.",
			roster: "Members",
			tasks: "Shared tasks",
			model: "Model",
			open: "Open member conversation",
			current: "Current chat",
			owner: "Owner",
			unowned: "Unowned",
			blockedBy: "Blocked by",
			writeScopes: "Write scopes",
			ready: "Ready",
			blocked: "Blocked by dependencies",
			"task.expand": "Show more",
			"task.collapse": "Show less",
			"memberStatus.running": "Running",
			"memberStatus.inactive": "Inactive",
			"memberStatus.provisioning": "Provisioning",
			"memberStatus.failed": "Failed",
			addOpen: "Add teammate",
			addClose: "Close",
			addName: "Teammate name",
			addTask: "Initial task",
			addModel: "Model",
			addModelDefault: "Same as Lead",
			addFork: "Inherit Lead context",
			addSubmit: "Create teammate",
			addBusy: "Creating…",
			addMissing: "A name and an initial task are required",
			memberModel: "Change this teammate's model",
			memberModelDefault: "Default model",
			memberModelRebuild: "Rebuild this teammate on:",
			memberModelConfirm: "Rebuild",
			memberModelSwitching: "Rebuilding…",
			memberModelCancel: "Cancel",
			memberRetire: "Retire",
			memberRetiring: "Retiring…",
			"status.pending": "Pending",
			"status.in_progress": "In progress",
			"status.completed": "Completed"
		};
		//#endregion
		//#region lib/types/client/mount.js
		/**
		* Error boundary around the Team action.
		*
		* A throw anywhere in the panel would otherwise unmount the registered
		* component, and the conversation header would silently lose its Team entry
		* point: the renderer reports client-plugin *load* failures, never a render
		* crash. Keeping the entry point mounted and printing the message turns the
		* failure into something the user can see and report.
		*/
		class TeamActionBoundary extends react.Component {
			constructor(props) {
				super(props);
				this.state = { error: null };
			}
			static getDerivedStateFromError(error) {
				return { error };
			}
			render() {
				if (this.state.error === null) return this.props.children;
				return (0, react_jsx_runtime.jsx)("span", {
					role: "alert",
					className: TeamAction_module_css_default.notice,
					title: String(this.state.error?.stack ?? this.state.error),
					children: `agent-team: ${String(this.state.error?.message ?? this.state.error)}`
				});
			}
		}
		/** The Team action wrapped so a render error cannot remove the header entry point. */
		const TeamActionGuarded = (props) => (0, react_jsx_runtime.jsx)(TeamActionBoundary, {
			children: (0, react_jsx_runtime.jsx)(TeamAction, props)
		});
		/** Source-safe Agent Teams browser registration. */
		/**
		* Required browser services for navigation, slots, and localized copy.
		*
		* The Remote capability namespaces (`remote.session`, `remote.commands`) are
		* deliberately NOT declared: a declared token that this composition does not
		* publish parks the fiber, and a parked plugin silently loses the header
		* action. They are read through the ungated `ctx.get` at call time instead,
		* which needs no token and yields `undefined` when the namespace is absent.
		* (Verified against the shipped Cordis by `checks/remote-namespace-check.mjs`.)
		*/
		const inject = [
			"sessions",
			"uiWorkspace",
			"slots",
			"locale"
		];
		/**
		* Register the Team locale dictionaries and the conversation-header action.
		* The panel reads the Lead Session's `agentTeam` projection from the shared
		* Session store; this registration performs no Team RPC.
		* @param ctx - Client Context carrying the injected navigation, locale, slot, and Session services.
		*/
		function registerAgentTeamUi(ctx) {
			try {
				ctx.effect(() => ctx.locale.register(NS, {
					zh,
					en
				}), "client-ui-agent-team: dictionaries");
			} catch {
				// A re-apply after a client-module graph update can find the namespace
				// already registered; the header action matters more than the copy.
			}
			const sessions = ctx.sessions;
			const leadSessionId = (sessionId) => {
				return (sessions.binding(sessionId)?.session.getSnapshot().subagent?.address)?.parentSessionId ?? sessionId;
			};
			// A capability namespace is its own Cordis service named
			// `remote.<namespace>` (`dsh-api-gateway`'s `RemoteNamespaceService`
			// calls `super(ctx, "remote.session")`), so `ctx.remote.session` throws
			// `cannot get property "remote.session" without inject` unless the dotted
			// token is declared. `ctx.get` is the ungated store lookup: it resolves
			// the namespace with no token at all (verified against the shipped Cordis
			// by `checks/remote-namespace-check.mjs`) and yields `undefined` when the
			// namespace is absent, so every action degrades instead of throwing while
			// `apply` runs — a throw there fails the whole renderer boot with no
			// error message.
			const remoteNamespace = (space) => {
				try {
					return ctx.get(`remote.${space}`);
				} catch {
					return void 0;
				}
			};
			const actions = { openTeammate(sessionId, childSessionId) {
				const parentSessionId = leadSessionId(sessionId);
				if ((sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0) === 0) return;
				if (childSessionId === parentSessionId) {
					ctx.uiWorkspace.openSession(parentSessionId);
					return;
				}
				ctx.uiWorkspace.openSession({
					parentSessionId,
					childSessionId,
					mode: "continuable"
				});
			},
			async loadModels() {
				const session = remoteNamespace("session");
				if (session === void 0) return [];
				const result = await session.modelCatalog();
				return result.ok ? result.value.groups : [];
			},
			async runTeamCommand(sessionId, line) {
				const commands = remoteNamespace("commands");
				if (commands === void 0) return {
					kind: "error",
					text: "agent-team: roster commands are unavailable in this composition"
				};
				const result = await commands.execute(sessionId, line, []);
				if (!result.ok) return {
					kind: "error",
					text: `${result.error.code}: ${result.error.message}`
				};
				if (result.value === void 0) return {
					kind: "error",
					text: `unknown command: ${line}`
				};
				return result.value.result;
			} };
			ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "agent-team",
				order: -20,
				locale: NS,
				inject: () => actions
			}, TeamActionGuarded));
			// Diagnostics only: a renderer-side failure is never reported anywhere the
			// host can read, so record that this plugin mounted in the current page.
			try {
				localStorage.setItem("dsh.agent-team.mount", JSON.stringify({
					at: Date.now(),
					inject
				}));
			} catch {
				// A composition without localStorage keeps working; the marker is optional.
			}
		}
		//#endregion
		//#region lib/types/client/index.js
		/** Browser entry registering the Agent Teams conversation-header action. */
		/**
		* Register the Team locale dictionaries and header action on the Client Context.
		* @param ctx - Client Context with the declared `inject` services available.
		*/
		function apply(ctx) {
			registerAgentTeamUi(ctx);
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map