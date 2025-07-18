import { useStore } from "@store"
import React, {
	useEffect,
	useState,
	useRef
} from "react"
import { Toast } from "@diezhi/yesio"
import {
	CommonTips,
	SpineResources
} from "../../constant"
import {
	useLockFn,
	useLottie
} from "@diezhi/pudge"
import {
	errorHandler,
	updateCommonTds
} from "../../service"
import BgmPlayer from "../../components/BgmPlayer"
import BackIcon from "./img/back.png"
import StarIcon from "./img/star.png"
import ScoreText from "./img/score-text.png"
import ScoreBg from "./img/score-bg.png"
import GetMore from "./img/get-more.png"
import showModal from "../../components/Modal"
import useAccount from "../../hooks/useAccount"
import useService from "../../hooks/useService"
import { getRolesInfo } from "../../utils/role"
import lottieData from "./lottie/btn/data.json"
import Tip from "./img/tip.png"
import { PixiSp } from "@diezhi/yesio/dist/pixisp"
import "./index.scss"
import {
	pageViewLog,
	drawLog
} from "../../log"

const Home = ({ isBilibili }) => {
	const [{ isLogin }, account] =
		useAccount({ isBilibili })
	const { dispatch, store } = useStore()
	const service = useService()
	const [score, setScore] = useState(0)
	const [awardList, setAwardList] =
		useState([])
	const {
		sound: { play, playing, pause },
		role
	} = store

	const pixiRef = useRef()
	const lottieRef = useRef()
	const [lottieReady, setLottieReady] =
		useState(false)
	const [
		{
			play: playLottie,
			pause: pauseLottie
		}
	] = useLottie(lottieRef, lottieData, {
		autoplay: false,
		loop: true,
		onReady(lottie) {
			setLottieReady(true)
			lottie.goToAndStop(12.529, true)
		}
	})

	/**
	 * 跳转
	 */
	const goto = (scene) => {
		dispatch("goto", scene)
	}

	// 获取最新分数
	const getScore = async () => {
		try {
			const res =
				await service.getScore()
			setScore(res?.score || 0)
		} catch (err) {
			errorHandler(err)
		}
	}

	// 获取奖励列表
	const getAwardList = async () => {
		try {
			const res =
				await service.getDrawRecord()
			const allList = res?.list || []
			const visibleList =
				allList.filter((item) =>
					[4, 7, 99].includes(
						item?.type
					)
				)
			setAwardList(visibleList)
		} catch (err) {
			errorHandler(err)
		}
	}

	// 抽奖
	const clickFire = useLockFn(
		async () => {
			try {
				if (!score) {
					Toast(CommonTips.noScore)
					return
				}
				if (!role?.AccntID) {
					Toast(CommonTips.drawNoRole)
					return
				}
				const res = await service.draw({
					vRoleId: +role.AccntID,
					vZoneId: +role.ZoneID
				})
				pixiRef?.current?.updateAnimation?.(
					"idle_2"
				)
				setTimeout(() => {
					showModal({
						type: "award",
						id: res?.package_id,
						code: res?.package_content,
						service,
						isBilibili
					})
					// 火花数更新
					getScore()
					// 奖励列表更新
					getAwardList()
					pixiRef?.current?.updateAnimation?.(
						"idle_3"
					)
				}, 100)

				drawLog({
					actionresult: {
						result: 0
					}
				})
			} catch (err) {
				drawLog({
					actionresult: {
						result: 1
					}
				})
				errorHandler(err)
			}
		}
	)

	// 点击奖励列表图标
	const clickStarIcon = useLockFn(
		() => {
			if (!awardList?.length) {
				Toast("暂无获得奖励")
				return
			}
			showModal({
				type: "awardList",
				service,
				isBilibili,
				awardList
			})
		}
	)

	useEffect(() => {
		getScore()
		getRolesInfo({
			isLogin,
			account,
			isBilibili,
			dispatch,
			updateCommonTds
		})
		getAwardList()
		pageViewLog("lottery")
	}, [])

	useEffect(() => {
		if (lottieReady) {
			playing
				? playLottie()
				: pauseLottie()
		}
	}, [playing, lottieReady])

	return (
		<div className="lottery">
			<div className="lotteryHeader">
				<img
					className="icon-back"
					onClick={() => goto("index")}
					src={BackIcon}
				/>
				<div className="lotteryHeaderRight">
					<BgmPlayer
						className="lottery-music-btn"
						play={play}
						playing={playing}
						pause={pause}
					/>
					<img
						className="lottery-icon-award"
						// onClick={() => showModal({ type: 'awardList', service, isBilibili })}
						onClick={clickStarIcon}
						src={StarIcon}
					/>
				</div>
			</div>

			{/* 数量 */}
			<div className="lotteryInfo">
				<img
					className="lotteryInfoTitle"
					src={ScoreText}
					alt=""
				/>

				<div className="lotteryInfoCount">
					<img src={ScoreBg} alt="" />
					<div className="lottery-score">
						{score}
					</div>
				</div>
			</div>

			<PixiSp
				ref={pixiRef}
				className="lottery-spine"
				data={SpineResources}
				autoAnimation="idle_1"
				onReady={() => {}}
				x={-110}
				y={-140}
			/>

			<div
				className="lotteryFireBtn"
				ref={lottieRef}
				onClick={clickFire}
			/>

			<img
				className="taskBtn"
				onClick={() => goto("task")}
				src={GetMore}
			/>

			<img
				className="lottery-tip"
				src={Tip}
				alt=""
			/>
		</div>
	)
}

export default Home
