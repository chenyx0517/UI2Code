import { useStore } from "@store"
import React, {
	useEffect,
	useState,
	useRef
} from "react"
import BgmPlayer from "../../components/BgmPlayer"
import {
	taskList,
	bilibiliTaskList,
	milestones,
	TaskFlowIdMap,
	BilibiliTaskFlowIdMap,
	taskFinishedBg,
	taskBg,
	finishTextBtn,
	clientId,
	CommonTips,
	downloadUrlBilibili
} from "../../constant"
import {
	errorHandler,
	updateCommonTds
} from "../../service"
import useAccount from "../../hooks/useAccount"
import useService from "../../hooks/useService"
import {
	gameDownloadMobile,
	env,
	registerPageHidden
} from "@diezhi/momo"
import { Toast } from "@diezhi/yesio"
import showModal from "../../components/Modal"
import {
	useLockFn,
	useLottie
} from "@diezhi/pudge"
import ScoreBg from "./img/score-bg.png"
import LotteryBtn from "./img/lottery-btn.png"
import { getRolesInfo } from "../../utils/role"
import {
	pageViewLog,
	clickMilestoneLog,
	finishTaskLog,
	downloadGameLog
} from "../../log"
import { isElementInViewport } from "../../utils"
import classNames from "classnames"

import "./index.scss"

const Home = ({ isBilibili }) => {
	return (
		<div className="taskPage">
			{/* header */}
			<div className="taskHeader">
				<div
					className="icon-back"
					onClick={() => goto("index")}
				/>
				<div className="taskHeaderRight">
					{/* bgm */}
					<BgmPlayer
						className="task-music-btn"
						play={play}
						playing={playing}
						pause={pause}
					/>
				</div>
			</div>

			{/* 里程碑 */}
			<div className="milestone">
				<div className="milestoneMain">
					{Object.keys(
						milestoneRes
					).map((key, index) => (
						<div
							className={`milestoneItem milestoneItem${
								index + 1
							}`}
							key={key}
							onClick={() =>
								clickGetReward(
									milestoneRes[key]
										?.isGet,
									milestoneRes[key]
								)
							}
							style={{
								backgroundImage: `url(${milestoneRes[key]?.img})`
							}}
						>
							{milestoneRes[key]
								?.isGet ? (
								<div
									className="milestoneGet"
									style={{
										backgroundImage: `url(${milestoneRes[key]?.receivedImg})`
									}}
								/>
							) : (
								<div className="milestoneScore">
									<div>
										<span className="currentScore">
											{score}
										</span>
										/
										{
											milestoneRes[key]
												?.score
										}
									</div>
									<div>领取</div>
								</div>
							)}
						</div>
					))}
				</div>
				<div className="milestoneAmount">
					<img src={ScoreBg} alt="" />
					<span>
						*已累积获取火花数量：{score}
					</span>
				</div>
			</div>

			{/* 任务 */}
			<div className="task">
				<div className="taskList">
					{taskRes?.map((item, key) => (
						<div
							className={`taskItem ${
								item.left_num === 0
									? "taskItemFinished"
									: ""
							}`}
							key={key}
							onClick={() =>
								clickTask(item)
							}
							style={{
								backgroundImage: `url(${
									item?.left_num === 0
										? taskFinishedBg
										: taskBg
								})`
							}}
						>
							<div className="taskItemLeft">
								<div
									className={classNames(
										"taskItemTitle",
										{
											inviteTitle:
												item.key ===
												"inviteRegister"
										}
									)}
									dangerouslySetInnerHTML={{
										__html: item.text
									}}
								/>
								<div
									className="taskItemTip"
									dangerouslySetInnerHTML={{
										__html: item.tip
									}}
								/>
							</div>
							<div className="taskItemRight">
								<div
									className="taskItemBtnText"
									style={{
										backgroundImage: `url(${
											item?.left_num ===
											0
												? finishTextBtn
												: item?.unfinishedText
										})`
									}}
								/>
								{item.left_num !== 0 &&
									item?.timeText && (
										<div className="taskItemBtnTip">
											{item?.timeText}
										</div>
									)}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* 底部区域 */}
			<div className="taskPageBtm">
				<img
					src={LotteryBtn}
					className="fireBtn"
					onClick={() =>
						goto("lottery")
					}
					ref={fireBtnRef}
				/>

				<div className="taskPageBtmTip">
					积累的所有火花均可参与抽奖，额外获取丰厚奖励哦~
				</div>
			</div>

			{/* 吸底的箭头 */}
			{!fireBtnShow && (
				<div
					className="fixed-bottom-arrow"
					onClick={() => {
						fireBtnRef.current?.scrollIntoView(
							{
								behavior: "smooth",
								block: "start"
							}
						)
					}}
					ref={lottieRef}
				/>
			)}
		</div>
	)
}

export default Home
