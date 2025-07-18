import classNames from "classnames"
import {
	LottieComponent,
	Toast
} from "@diezhi/yesio"
import {
	useState,
	useEffect,
	useCallback,
	useRef
} from "react"
import { isInSDK } from "@diezhi/jsbridge"
import { useStore } from "@store"
import {
	useCurrentLang,
	useT
} from "@i18n"
import {
	checkIsValidRoleInfo,
	getIntroRead,
	clearIntroRead,
	preloadImagesWithProgress,
	clearLocalLang,
	getTemplateUrl
} from "../../utils"
import {
	isLoginFn,
	isLoginSDK,
	logoutFn,
	getRoles
} from "../../service/account"
import { errorHandler } from "../../service"
import Login from "../../components/Login"
import Header from "../../components/Header"
import RuleIcon from "../../components/RuleIcon"
import TimeLeft from "../../components/TimeLeft"
import LottieBg from "../../components/LottieBg"
import { showModal } from "../../components/Modal"
import useProgress from "../../hooks/useProgress"
import usePicRed from "../../hooks/usePicRed"
import useTaskRed from "../../hooks/useTaskRed"
import useService from "../../hooks/useService"
import {
	getUrlParam,
	removeUrlParams,
	copy
} from "@diezhi/momo"
import "./index.scss"
import {
	inviteKey,
	IdentityEnum,
	sceneMap,
	musicListMap,
	homePlayBtn,
	officialPlatIdArr
} from "../../constsnt"
import { failType } from "../../components/Modal/HelpFailure"
import preloadGameIntro from "../gameIntro/preload"
import { loginLog } from "../../log"

const needDebug = false

const Home = ({ isOverSea }) => {
	const t = useT()
	const lottieMap = t("lottieMap", {
		returnObjects: true
	})
	const tdsErrorMsg = t("tdsErrorMsg", {
		returnObjects: true
	})
	const lottieRef = useRef(null)
	const { handleGetProgress } =
		useProgress()
	const { handleGetPicRed } =
		usePicRed()
	const { handleGetTaskRed } =
		useTaskRed()
	const [
		loginVisible,
		setLoginVisible
	] = useState(false)
	const [lottieReady, setLottieReady] =
		useState(false)
	const service = useService()
	const { store, dispatch } = useStore()
	const lang = useCurrentLang()
	const code = getUrlParam(inviteKey)
	const isGuest = !!code
	const [
		guestNotLogin,
		setGuestNotLogin
	] = useState(false)
	const [tdsErr, setTdsErr] =
		useState("")
	const {
		btnSound: { playBtn }
	} = store

	const homePlayBtnUrl = getTemplateUrl(
		isOverSea,
		homePlayBtn
	)

	const openRuleModal = () => {
		const isChannel =
			!isOverSea &&
			store?.userInfo?.platid &&
			!officialPlatIdArr.includes(
				store?.userInfo?.platid
			)
		showModal({
			modalType: "rule",
			className: "rule-modal",
			modalProps: {
				isChannel
			}
		})
		if (needDebug) {
			if (store.isLogin) {
				const { nid } = store.userInfo
				if (copy(nid)) {
					copy(nid)
					Toast("复制nid成功")
				}
			}
		}
	}

	const needLogin = useCallback(() => {
		// 活动已经结束或者未开始，直接拦截
		if (tdsErr) {
			Toast(tdsErr)
			return true
		}

		if (!store.isLogin) {
			console.log("未登录")
			setLoginVisible(true)
			return true
		}

		return false
	}, [store.isLogin, tdsErr])

	const gotoGame = () => {
		if (needLogin()) {
			return
		}

		console.log("进入游戏")
		const isRead = getIntroRead({
			isOverSea
		})
		if (isRead) {
			dispatch(
				"goto",
				sceneMap.actorSelect
			)
		} else {
			// 小剧情只需要看一次即可
			dispatch(
				"goto",
				sceneMap.gameIntro
			)
		}
	}

	const removeParamsAndReload = () => {
		const newUrl = removeUrlParams({
			keys: [inviteKey]
		})
		window.location.href = newUrl
	}

	// 获取客态用户身份并绑定
	const fetchIdentityAndBind =
		async () => {
			// 需要弹窗关闭后移除参数并刷新
			const showHelpFailure = (
				type
			) => {
				showModal({
					modalType: "helpFailure",
					onClose:
						removeParamsAndReload,
					modalProps: {
						type,
						goToLink:
							removeParamsAndReload
					},
					className: "common-blur-modal"
				})
			}
			try {
				const { status } =
					await service.queryIdentity()

				if (
					status ===
						IdentityEnum.BACK &&
					code
				) {
					try {
						loginLog({
							actionresult: 0,
							is_invited: 1,
							user_type: 2,
							have_role: 2
						})

						const { ret } =
							await service.bindCode({
								code
							})
						// 绑定失败的各种情况
						const retTypeMap = {
							1: failType.noFind,
							110: failType.helpEnd,
							111: failType.noChance,
							112: failType.helpSelf,
							600: failType.noAccess
						}
						if (ret === 0) {
							// 绑定成功
							playBtn(
								musicListMap.helpSuccess
							)
							showModal({
								modalType:
									"helpSuccess",
								className:
									"common-blur-modal success",
								modalProps: {
									clickLink:
										removeParamsAndReload
								}
							})
						} else if (
							retTypeMap[ret]
						) {
							playBtn(
								musicListMap.helpFail
							)
							showHelpFailure(
								retTypeMap[ret]
							)
						}
					} catch (err) {
						console.log("bindCode", err)
						if (err.ret === 600) {
							playBtn(
								musicListMap.helpFail
							)
							showHelpFailure(
								failType.noAccess
							)
						}
					}
				} else {
					playBtn(musicListMap.helpFail)
					// 不符合回归猎人要求
					showHelpFailure(
						failType.noAccess
					)
					loginLog({
						actionresult: 0,
						is_invited: 1,
						user_type: status,
						have_role: 2
					})
				}
			} catch (error) {
				console.error(
					"queryIdentity",
					error
				)
				if (error.ret === 600) {
					playBtn(musicListMap.helpFail)
					showHelpFailure(
						failType.noAccess
					)
				}
				loginLog({
					actionresult: 0,
					is_invited: 1,
					user_type: 1,
					have_role: 2
				})
			}
		}

	const afterGetRoleInfo = async () => {
		if (isGuest && guestNotLogin) {
			//自动完成绑定
			fetchIdentityAndBind()
			setGuestNotLogin(false)
			return
		}

		try {
			const { status } =
				await service.queryIdentity()
			if (
				status === IdentityEnum.BACK
			) {
				loginLog({
					actionresult: 0,
					is_invited: 0,
					have_role: 2,
					user_type: 2
				})
			}

			if (status === IdentityEnum.NEW) {
				loginLog({
					actionresult: 0,
					is_invited: 0,
					have_role: 2,
					user_type: 3
				})
			}
		} catch (err) {
			loginLog({
				actionresult: 0,
				is_invited: 0,
				have_role: 2,
				user_type: 1
			})
		}
	}

	useEffect(() => {
		const init = async () => {
			if (store.isLogin) {
				// 必须先调用dailyLogin再调用getTaskList
				try {
					const dailyLoginRes =
						await service.dailyLogin()
					handleGetProgress()
					handleGetPicRed()
					handleGetTaskRed()
					console.log(
						"dailyLoginRes",
						dailyLoginRes
					)
				} catch (err) {
					// 如果活动未开始或者已结束，这里设置全局状态，保证按钮逻辑
					console.error("init", err)
					if (err?.ret === 201) {
						// 已经结束
						setTdsErr(
							tdsErrorMsg.activityEnd
						)
					}

					if (err?.ret === 200) {
						// 未开始
						setTdsErr(
							tdsErrorMsg.activityNotStart
						)
					}
					errorHandler({
						err,
						isOverSea
					})
				}
			}
		}

		init()
	}, [store.isLogin])

	useEffect(() => {
		if (isInSDK()) {
			// 端内登录失败，则手动开启登录弹窗
			isLoginSDK().then((res) => {
				if (!res) {
					needLogin()
					return
				}

				try {
					service
						.queryIdentity()
						.then((newRes) => {
							// 开始上报埋点了
							if (
								newRes &&
								newRes.status ===
									IdentityEnum.BACK
							) {
								loginLog({
									actionresult: 0,
									is_invited: 0,
									have_role: 2,
									user_type: 2
								})
							}

							if (
								newRes &&
								newRes.status ===
									IdentityEnum.NEW
							) {
								loginLog({
									actionresult: 0,
									is_invited: 0,
									have_role: 2,
									user_type: 3
								})
							}
						})
						.catch((err) => {
							loginLog({
								actionresult: 0,
								is_invited: 0,
								have_role: 2,
								user_type: 1
							})
						})
				} catch (err) {}
			})
		} else {
			// 在端外打开，并且已经有登录态了，需要检查本地存储的roleId是否有效，防止被篡改
			const init = async () => {
				const loginRes = isLoginFn({
					isOverSea
				})
				if (loginRes) {
					try {
						const roles =
							await getRoles({
								isOverSea
							})
						const isValid =
							checkIsValidRoleInfo(
								roles,
								loginRes
							)
						if (!isValid) {
							// 校验不通过，强行退出
							logoutFn({ isOverSea })
						}
					} catch (err) {
						errorHandler({
							err,
							isOverSea
						})
					}
				}
			}
			init()
		}
	}, [])

	// 点击我要助力
	const handleHelp = () => {
		console.log("点击我要助力")
		/*
    1. 判断登录态
      1.1 未登录，展示登录弹窗
      1.2 已登录，查询用户身份并完成绑定
    */
		if (needLogin()) {
			setGuestNotLogin(true)
			return
		}
		fetchIdentityAndBind()
	}
	const goToDemo = () => {
		clearIntroRead()
		dispatch("goto", sceneMap.demo)
	}

	// 客态逻辑
	useEffect(() => {
		if (isGuest) {
			// 展示我要助力弹窗
			showModal({
				modalType: "confirmHelp",
				modalProps: {
					confirm: handleHelp
				},
				className: "common-blur-modal"
			})
		}
	}, [isGuest])

	useEffect(() => {
		const isRead = getIntroRead({
			isOverSea
		})
		if (!isRead) {
			// 预加载下一页的资源
			console.log("预加载下一页的资源")
			preloadImagesWithProgress(
				preloadGameIntro
			).then(
				({ successes, failures }) => {
					// console.log('successes', successes)
					// console.log('failures', failures)
				}
			)
		}
	}, [])

	useEffect(() => {
		if (lottieReady) {
			lottieRef.current?.dynamicReplaceImg(
				{
					"btn-g.png": lottieMap.playBtn
				}
			)
		}
	}, [lang, lottieReady])

	return (
		<div
			className={classNames(
				"home-container",
				"scenes",
				lang
			)}
		>
			<LottieBg isOverSea={isOverSea} />
			<div className="safe-content">
				<div
					className={classNames(
						"header-container",
						className,
						lang
					)}
				>
					<Back
						className={classNames(
							"back-icon",
							{ hide: !showBack }
						)}
					/>
					<div className="top-right">
						<div
							className={classNames(
								"top-right-icon-container",
								{
									hide: collapseHide,
									show: collapseShow
								}
							)}
						>
							<Setting className="right-icon" />
							{/* <Version className="right-icon" /> */}
							<Share
								className="right-icon"
								onClick={
									handleShareClick
								}
							/>
						</div>
						{isMapScene ? (
							<Collapse
								collapsed={collapsed}
								onClick={handleCollapse}
								className="right-icon collapse-icon"
							/>
						) : null}
					</div>
					<div
						className={classNames(
							"sider-right",
							{
								hide: collapseHide,
								show: collapseShow
							}
						)}
					>
						<Task
							className="sider-icon"
							onClick={gotoTask}
						/>
						<PicCollect
							className="sider-icon"
							onClick={gotoPicCollect}
						/>
					</div>
				</div>
				<div className="home-content">
					{/* 5个服5个lottie */}
					<LottieComponent
						path={lottieMap.slogan}
						className="lottie-slogan"
						autoplay
						loop
					/>
					<RuleIcon
						className="rule-icon"
						onClick={openRuleModal}
					/>
					{!tdsErr &&
					store.isLogin &&
					store?.userInfo?.zone ? (
						<TimeLeft
							className="time-left"
							// onClick={goToDemo}
							zone={store.userInfo.zone}
							isOverSea={isOverSea}
							// onClick={clearLocalLang}
						/>
					) : null}
					{/* 动态替换 按钮图片 */}
					<LottieComponent
						path={homePlayBtnUrl}
						className={classNames(
							"lottie-play-btn",
							{ show: lottieReady }
						)}
						autoplay
						loop
						onClick={gotoGame}
						dynamic={{
							"btn-g.png":
								lottieMap.playBtn
						}}
						onReady={() => {
							setLottieReady(true)
						}}
						ref={lottieRef}
					/>
				</div>
			</div>
			<Login
				visible={loginVisible}
				changeVisible={setLoginVisible}
				onLoginSuccess={
					afterGetRoleInfo
				}
				isOverSea={isOverSea}
			/>
		</div>
	)
}

export default Home
