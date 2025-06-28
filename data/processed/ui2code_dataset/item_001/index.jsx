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
