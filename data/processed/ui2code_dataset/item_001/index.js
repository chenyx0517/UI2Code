import {
	useState,
	useEffect,
	useRef
} from "react"
import { useStore } from "@store"
import {
	getUrlParam,
	env,
	gameDownloadMobile,
	copy
} from "@diezhi/momo"
import { Toast } from "@diezhi/yesio"
import BgmPlayer from "../../components/BgmPlayer"
import Login from "../../components/Login"
import useAccount from "../../hooks/useAccount"
import useService from "../../hooks/useService"
import {
	errorHandler,
	updateCommonTds
} from "../../service"
import {
	loginResutLog,
	pageViewLog,
	openByInviteLinkLog
} from "../../log"
import {
	codeKey,
	downloadUrlBilibili,
	clientId,
	Animation
} from "../../constant"
import showModal from "../../components/Modal"
import Logo from "../../assets/icon/logo.png"
import { setUrlParams } from "../../utils"
import { getRolesInfo } from "../../utils/role"
import { BgFilmPlayer } from "@diezhi/yesio/dist/bg-film-player"

import "./index.scss"

const Home = ({
	isBilibili,
	needDebug = false
}) => {
	const { dispatch, store } = useStore()
	const [{ logout, isLogin }, account] =
		useAccount({ isBilibili })
	const service = useService({
		isBilibili
	})
	const [
		loginVisible,
		setLoginVisible
	] = useState(false)
	const shareCode =
		getUrlParam()[codeKey]
	const hasShareCode = !!shareCode
	const videoRef = useRef(null)

	const {
		sound: { play, playing, pause }
	} = store

	const getUserInfo = async () => {
		if (!isLogin()) {
			return
		}
		try {
			const res =
				await service.getInfo()
			if (res) {
				dispatch("userInfo", res)
			}

			return res
		} catch (err) {
			errorHandler({ err })
		}
	}

	/**
	 * 跳转
	 */
	const goto = (scene) => {
		if (!isLogin()) {
			handleLogin()
			return
		}
		dispatch("goto", scene)
	}

	/**
	 * 点击登录登出按钮
	 */
	const clickLoginOrLogout = () => {
		if (isLogin()) {
			handleLogout()
			return
		}
		handleLogin()
	}

	const handleLogin = () => {
		if (isBilibili) {
			biliLogin()
			return
		}
		setLoginVisible(true)
	}

	const handleLogout = () => {
		logout()
		location.reload()
	}

	const biliLogin = () => {
		account.bilibiliLogin({
			bilibiliAccount: true
		})
	}

	const loginUp = async (data) => {
		loginResutLog({
			actionresult: 0,
			actionparam: {
				message: "登录成功"
			}
		})
		if (hasShareCode) {
			// 客态，登录后刷新页面
			location.reload()
			return
		}
		dispatch("isLogin", true)
		updateCommonTds({ isBilibili })
		await getUserInfo()
	}

	/** 登录失败 */
	const loginError = (err) => {
		const message =
			typeof err === "string"
				? err
				: err?.info || "登录失败"
		loginResutLog({
			actionresult: 1,
			actionparam: {
				message
			}
		})
	}

	/**
	 * 客态初始化逻辑
	 * 1. 检测是否有分享码，有的话就执行下面的逻辑
	 * 2. 如果用户处于已登录状态，就获取用户的绑定用户信息和游戏角色，同时获取邀请码的邀请人信息
	 * 3. 如果用户已接受过其他人的邀请，就弹窗提示用户已经接受过邀请，不能重复接受邀请
	 * 4. 如果用户已有游戏角色，就弹窗提示用户已有游戏角色，不能接受邀请
	 * 5. 其余情况可以接受邀请，显示接受邀请弹窗
	 */
	const initGeust = async () => {
		if (!hasShareCode) {
			return
		}
		openByInviteLinkLog()

		if (isLogin()) {
			Promise.all([
				getRolesInfo({
					isLogin,
					account,
					isBilibili,
					dispatch,
					updateCommonTds
				}),
				getBindUserNid(),
				getInviteInfo()
			])
				.then((res) => {
					const { nid } = isLogin()
					const [
						role,
						bindUserNid,
						inviteUserNid
					] = res

					// 1. 邀请码是自己的
					if (nid === inviteUserNid) {
						showModal({
							type: "message",
							textNode: (
								<>
									需邀请其他未注册《无限暖暖》的用户
								</>
							),
							closefn:
								redirectToMasterPage
						})
						return
					}

					// 2. 绑定的用户和邀请码的用户是同一个 分有角色和无角色两种情况
					if (
						bindUserNid ===
							inviteUserNid &&
						bindUserNid
					) {
						if (role?.AccntID) {
							showModal({
								type: "message",
								textNode: (
									<>
										您已成功接受该用户的邀请~
									</>
								),
								closefn:
									redirectToMasterPage
							})
						} else {
							showModal({
								type: "message",
								textNode: (
									<div
										style={{
											textAlign:
												"center"
										}}
									>
										<div>
											已接受该用户的邀请，
										</div>{" "}
										<div>
											前往注册游戏即可成功完成邀请~
										</div>
									</div>
								),
								closefn:
									redirectToMasterPage
							})
						}
						return
					}

					// 3. 已经有角色 || 已经完成过注册任务
					if (role?.AccntID) {
						// 已经有角色
						showModal({
							type: "message",
							textNode: (
								<>
									您已经是游戏注册用户啦~
								</>
							),
							closefn:
								redirectToMasterPage
						})
						return
					}

					// 3. 已经接受过邀请
					if (bindUserNid) {
						showModal({
							type: "message",
							textNode: (
								<>
									您已经接受过其他人的邀请啦~
									<br />
									每位好友只能接受1次邀请哦
								</>
							),
							closefn:
								redirectToMasterPage
						})
						return
					}

					// 4. 符合条件，显示接受邀请弹窗
					showModal({
						type: "guest",
						accept
					})
				})
				.catch(() => {})
		} else {
			// 显示接受邀请弹窗
			showModal({
				type: "guest",
				accept
			})
		}
	}

	/**
	 * 客态点击 “接受邀请” 按钮
	 */
	const accept = async () => {
		if (!isLogin()) {
			handleLogin()
			return
		}
		try {
			await service.bindUser({
				code: shareCode
			})
			Toast("接受邀请成功")
			setTimeout(() => {
				goToRegister()
			}, 300)
		} catch (err) {
			errorHandler(err)
		}
	}

	/**
	 * 前往下载游戏
	 */
	const goToRegister = () => {
		if (isBilibili) {
			if (env.isIOS()) {
				location.href =
					downloadUrlBilibili
			} else {
				window.open(downloadUrlBilibili)
			}
		} else {
			gameDownloadMobile({
				clientId,
				env: "prod"
			})
		}
	}

	/**
	 * 获取已绑定的用户
	 */
	const getBindUserNid = async () => {
		try {
			const res =
				await service.getBindUserNid()
			return res?.target_nid || false
		} catch (err) {
			// 没有成功获取到绑定的用户id
			errorHandler(err)
			return false
		}
	}

	/**
	 * 重定向到主态页面
	 */
	const redirectToMasterPage = () => {
		const url = setUrlParams({
			deleteParams: [codeKey]
		})
		location.replace(url)
	}

	/**
	 * 获取邀请码的邀请人信息
	 */
	const getInviteInfo = async () => {
		try {
			const res =
				await service.getInviteUserNid({
					code: shareCode
				})
			if (res.ret === 0) {
				return res?.nid || false
			} else if (res.ret === 9981) {
				// 邀请码无效
				Toast("邀请码无效")
				redirectToMasterPage()
			} else {
				return false
			}
		} catch (error) {
			Toast("邀请码无效")
			// 重定向到主态页面
			redirectToMasterPage()
		}
	}

	// debug模式，copy nid
	const handleDebug = () => {
		if (isBilibili && needDebug) {
			if (isLogin()) {
				const { nid } = isLogin()
				if (copy(nid)) {
					copy(nid)
					Toast("复制nid成功")
				}
			}
		}
	}

	// B服的初始化
	const bilibiliInit = async () => {
		const blogin =
			account.bilibiliLoginInit({
				bilibiliAccount: true
			})
		if (blogin.error_code) {
			loginResutLog({
				actionresult: 1,
				actionparam: {
					message: "登录失败"
				}
			})
			Toast("登录失败")
		} else {
			if (isLogin()) {
				loginResutLog({
					actionresult: 0,
					actionparam: {
						message: "登录成功"
					}
				})
				dispatch("isLogin", true)
				// 获取b站账号关联的叠纸账号信息
				await account.refreshBiliMomoAccount(
					{
						client: {
							clientid: account.clientid
						},
						biliToken: isLogin().token
					}
				)
				updateCommonTds({ isBilibili })
				getUserInfo()
			}
			initGeust()
		}
	}

	useEffect(() => {
		if (isBilibili) {
			bilibiliInit()
		} else {
			getUserInfo()
			initGeust()
		}

		pageViewLog("index")
	}, [])

	return (
		<div className="home">
			<BgFilmPlayer
				url={Animation.indexVideo}
				width={750}
				height={1692}
				poster={Animation.indexPoster}
				ref={videoRef}
				otherPlayerConfig={{
					autoplay: true,
					chunkSize: 0.8 * 1024 * 1024
				}}
			/>

			<div className="mask" />
			<div className="homeHeader">
				<div className="headerLeft">
					<div
						className="icon-rule"
						onClick={() =>
							showModal({
								type: "homeRule",
								isBilibili
							})
						}
					/>
					<div
						onClick={clickLoginOrLogout}
					>
						{isLogin() ? (
							<div className="logout-icon" />
						) : (
							<div className="login-icon" />
						)}
					</div>
					<div
						className="icon-award"
						onClick={() =>
							showModal({
								type: "awardList"
							})
						}
					/>
				</div>
				<div className="headerRight">
					<div className="homeHeaderItem">
						<BgmPlayer
							className="home-music-btn"
							play={play}
							playing={playing}
							pause={pause}
						/>
					</div>
				</div>
			</div>
			<img
				className="homeLogo"
				onClick={handleDebug}
				src={Logo}
				alt=""
			/>
			<div className="homeTitle" />
			<div className="homeBtn">
				<div
					className="homeBtnTask"
					onClick={() => goto("task")}
				/>
				<div
					className="homeBtnLottery"
					onClick={() =>
						goto("lottery")
					}
				/>
			</div>

			{/* 登录弹窗 */}
			<Login
				loginUp={loginUp}
				onLoginError={loginError}
				loginVisible={loginVisible}
				setLoginVisible={
					setLoginVisible
				}
				allowClose={!hasShareCode}
			/>
		</div>
	)
}

export default Home
