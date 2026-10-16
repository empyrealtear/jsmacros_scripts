// 脚本名称: 路径规划渲染
// 功能介绍: 路径规划渲染
// 依赖模组: 宏(jsmacros)、男中音(Baritone upoptimized版)
// 创建时间: 2026-07-30
// 修改时间: 2026-07-31
// 更新内容: v1.0 初始化脚本

const scriptName = 'BaritoneRender.ToggleScript'
const mclog = (msg, prefixColor = 0x5, msgColor = 0x7) => {
    Chat.log(Chat.createTextBuilder()
        .append("[").withColor(prefixColor)
        .append(scriptName).withColor(prefixColor)
        .append("]").withColor(prefixColor)
        .append(" " + msg).withColor(msgColor).build())
}
const isToggle = () => GlobalVars.getBoolean(scriptName)
const setToggle = (value) => {
    GlobalVars.putBoolean(scriptName, value)
    mclog(`${value ? "启用" : "关闭"}脚本`)
}
setToggle(!isToggle())

// 参数区
const block_ids = [
    'lootr_chest'
]
const d2d = Hud.createDraw2D()
const d2d_setting = {
    x: 5, y: d2d.getHeight() - 20,
    color: 0xFFFFFF,
    shadow: true,
    scale: 0.7,
    rotation: 0
}
const display_panel = []

const d3d = Hud.createDraw3D()
let right_click_listener = null

const BaritoneAPI = Java.type('baritone.api.BaritoneAPI')
// const SettingsUtil = Java.type('baritone.api.utils.SettingsUtil')
const BetterBlockPos = Java.type('baritone.api.utils.BetterBlockPos')
const GoalBlock = Java.type('baritone.api.pathing.goals.GoalBlock')
// const GoalNear = Java.type('baritone.api.pathing.goals.GoalNear')
const Favoring = Java.type('baritone.utils.pathing.Favoring')
const CalculationContext = Java.type('baritone.pathing.movement.CalculationContext')
const AStarPathFinder = Java.type('baritone.pathing.calc.AStarPathFinder')
// const PathRenderer = Java.type('baritone.utils.PathRenderer')
// const ColorClass = Java.type("java.awt.Color")

const ConvertToPos3D = (pos) => {
    let x = Math.floor(pos?.x ?? pos.getX())
    let y = Math.floor(pos?.y ?? pos.getY())
    let z = Math.floor(pos?.z ?? pos.getZ())
    return PositionCommon.createPos(x, y, z)
}

class DashLineRender {
    constructor(hud, options = {}) {
        this.hud = hud
        this.weight = options.weight ?? 0.3
        this.dashLen = options.dashLen ?? this.weight * 1.5
        this.gapLen = options.gapLen ?? this.weight
        this.step = this.dashLen + this.gapLen
        this.yOffset = options.yOffset ?? 0.01; // 纵向偏移参数
        this._r = this.weight / 2
    }

    draw(prev, next, color, cull = false) {
        const boxs = {}
        if (prev.x === next.x && prev.y === next.y && prev.z === next.z) return boxs
        const { _r: r, yOffset, hud, step, dashLen } = this
        let segId = 0

        // 单个盒体创建
        const addBox = (key, minX, minY, minZ, maxX, maxY, maxZ) =>
            boxs[key] = hud.addBox(minX, minY, minZ, maxX, maxY, maxZ, color, 100, color, 50, true, cull)

        // 轴向虚线绘制（x/z/y）
        const drawAxial = (p1, p2, axis) => {
            const x1 = p1.x + .5, y1 = p1.y + yOffset, z1 = p1.z + .5
            const x2 = p2.x + .5, y2 = p2.y + yOffset, z2 = p2.z + .5
            let len, sign = 1
            if (axis === 'x') { len = Math.abs(x2 - x1); sign = Math.sign(x2 - x1); }
            else if (axis === 'z') { len = Math.abs(z2 - z1); sign = Math.sign(z2 - z1); }
            else { len = Math.abs(y2 - y1); sign = Math.sign(y2 - y1); }
            if (len < 1e-3) return

            for (let t = 0, i = 0; t < len; t += step, i++) {
                const s = t, e = Math.min(t + dashLen, len)
                let minX, maxX, minY, maxY, minZ, maxZ
                if (axis === 'x') {
                    minX = x1 + sign * s; maxX = x1 + sign * e
                    minZ = z1 - r; maxZ = z1 + r
                    minY = y1; maxY = y1 + r
                } else if (axis === 'z') {
                    minZ = z1 + sign * s; maxZ = z1 + sign * e
                    minX = x1 - r; maxX = x1 + r
                    minY = y1; maxY = y1 + r
                } else {
                    minY = y1 + sign * s; maxY = y1 + sign * e + r
                    minX = x1 - r; maxX = x1 + r
                    minZ = z1 - r; maxZ = z1 + r
                }
                addBox(`s${segId}_d${i}`, minX, minY, minZ, maxX, maxY, maxZ)
            }
            segId++
        }

        // 水平斜向虚线（小正方形）
        const drawDiag = (p1, p2) => {
            const x1 = p1.x + .5, y = p1.y + yOffset, z1 = p1.z + .5
            const x2 = p2.x + .5, z2 = p2.z + .5
            const dx = x2 - x1, dz = z2 - z1
            const len = Math.hypot(dx, dz)
            if (len < 1e-3) return
            const ux = dx / len, uz = dz / len

            for (let t = 0, i = 0; t <= len; t += step, i++) {
                const cx = x1 + ux * t, cz = z1 + uz * t
                addBox(`s${segId}_d${i}`, cx - r, y, cz - r, cx + r, y + r, cz + r)
            }
            segId++
        }

        // 水平段统一调度
        const drawHoriz = (a, b) => {
            if (a.x === b.x) drawAxial(a, b, 'z')
            else if (a.z === b.z) drawAxial(a, b, 'x')
            else drawDiag(a, b)
        }
        // 纵向方向逻辑
        if (prev.y !== next.y) {
            if (next.y < prev.y) {
                // 向下：先水平，后垂直
                const mid = PositionCommon.createPos(next.x, prev.y, next.z)
                drawHoriz(prev, mid)
                drawAxial(mid, next, 'y')
            } else {
                // 向上：先垂直，后水平
                const mid = PositionCommon.createPos(prev.x, next.y, prev.z)
                drawAxial(prev, mid, 'y')
                drawHoriz(mid, next)
            }
        } else {
            drawHoriz(prev, next)
        }

        return boxs
    }
}

class BaritonePathResult {
    constructor(calcResult) {
        this.raw = calcResult
        this.type = calcResult?.getType()
        this.path = calcResult?.getPath().orElse(null)
        this.src = !this.path ? null : ConvertToPos3D(this.path.getSrc())
        this.goal = !this.path ? null : ConvertToPos3D(this.path.getGoal())
        this.end = !this.path ? null : ConvertToPos3D(this.path.getDest())
        this.expires = new Date()
        this.expires.setSeconds(this.expires.getSeconds() + 30)
    }

    positions() { return Array.from(this.path?.positions()?.toArray() ?? []).map(v => ConvertToPos3D(v)) }
    movements() { return Array.from(this.path?.movements()?.toArray() ?? []) }
    getNumNodesConsidered() { return this.path?.getNumNodesConsidered() }

    getDistance() {
        if (!this.path) return null
        let positions = this.positions()
        let dist = 0
        for (let i = 0; i < positions.length - 1; i++)
            dist += positions[i].toBlockPos().distanceTo(positions[i + 1])
        return dist
    }
    isNear(src, goal, limit = 5) {
        if (this.isEmpty() || this.isExpired())
            return false
        let src_dist = this.src.toBlockPos().distanceTo(src)
        let goal_dist = this.goal.toBlockPos().distanceTo(goal)
        return src_dist <= limit && goal_dist <= limit
    }
    isEmpty() {
        return !(this.raw && this.src && this.goal && this.positions().length > 1)
    }
    isExpired() {
        return this.expires.getTime() < Date.now()
    }
}

class BaritoneUtils {
    constructor() {
        this.baritone = BaritoneAPI.getProvider().getPrimaryBaritone()
        this.hud = Hud.createDraw3D()
        this.dashRender = new DashLineRender(this.hud, {
            weight: 0.1,       // 线宽
            yOffset: 0.1,     // 纵向偏移程度，可自由调整
            dashLen: 0.1,     // 虚线段长度（可选，默认=线宽*1.5）
            // gapLen: 0.3        // 虚线间隔长度（可选，默认=线宽）
        })
        this.pathCache = []
        this.hudCache = { key: '' }
        this.nearLimit = 3
        return this
    }

    ConvertToBetterBlockPos(pos) { return new BetterBlockPos(pos.x, pos.y, pos.z) }
    ConvertToGoalBlockPos(pos) { return new GoalBlock(pos.x, pos.y, pos.z) }

    registerHud() { this.hud.register(); return this }
    unregisterHud() { this.hud.unregister(); return this }
    removeAllElements() {
        this.hud.getBoxes().forEach(v => this.hud.removeBox(v))
        this.hud.getLines().forEach(v => this.hud.removeLine(v))
        this.hud.getDraw2Ds().forEach(v => this.hud.removeDraw2D(v))
        this.hud.getTraceLines().forEach(v => this.hud.removeTraceLine(v))
        this.hudCache = { key: '' }
        return this
    }

    getCalculationContext() {
        // baritone.pathing.movement.CalculationContext
        let context = null
        Client.runOnMainThread(JavaWrapper.methodToJava(
            () => context = new CalculationContext(this.baritone, true)),
            true, 1000)
        return context
    }

    manhattan(a, b, weight) {
        let coord_weight = { x: 1, y: 1, z: 1 }
        if (weight)
            coord_weight = { ...coord_weight, ...weight }
        return Math.abs(a.x - b.x) * coord_weight.x
            + Math.abs(a.y - b.y) * coord_weight.y
            + Math.abs(a.z - b.z) * coord_weight.z
    }
    findPath(src, goal, context) {
        let src_pos = ConvertToPos3D(src)
        let goal_pos = ConvertToPos3D(goal)
        let result = null
        let cache = []
        for (let item of this.pathCache) {
            if (!(item.isEmpty() || item.isExpired())) {
                if (item.isNear(src_pos, goal_pos, this.nearLimit))
                    result = this.pathCache
                cache.push(item)
            }
        }
        if (!result) {
            let primaryTimeout = BaritoneAPI.getSettings().planAheadPrimaryTimeoutMS.value
            let failureTimeout = BaritoneAPI.getSettings().planAheadFailureTimeoutMS.value
            if (!context) context = this.getCalculationContext()
            let previous = null
            let favoring = new Favoring(context.getBaritone().getPlayerContext(), previous, context)
            let pathfinder = new AStarPathFinder(
                this.ConvertToBetterBlockPos(src_pos), src_pos.x, src_pos.y, src_pos.z,
                this.ConvertToGoalBlockPos(goal_pos), favoring, context)
            let calcResult = pathfinder.calculate(primaryTimeout, failureTimeout)
            result = new BaritonePathResult(calcResult)
        }
        this.pathCache = cache
        return result
    }
    renderPath(pathResult, cull = false) {
        let colors = {
            line: 0xb71540,
            block: 0x7158e2,
            srcblock: 0xfc427b,
            endblock: 0x3742fa
        }

        let positions = pathResult.positions()
        if (positions.length < 2) return
        let movements = pathResult.movements()
        let start = ConvertToPos3D(Player.getPlayer().getBlockPos())
        let goal = pathResult.goal
        let end = pathResult.end
        let path_key = `${start}->${goal}`
        if (this.hudCache.key != path_key) {
            this.removeAllElements()
            this.hudCache.key = path_key
            // this.hud.addPoint(start.x + 0.5, start.y + 0.5, start.z + 0.5, 0.05, colors.srcblock, 200, cull)
            this.hud.addPoint(end.x + 0.5, end.y + 0.5, end.z + 0.5, 0.7, colors.endblock, 50, cull)
            for (let i = 0; i < positions.length - 1; i++) {
                let prev = i == 0 ? start : positions[i]
                let next = positions[i + 1]
                let action = movements[i]
                if (action) {
                    let tobreaks = action.toBreakAll()
                    for (let j = 0; j < tobreaks.length; j++) {
                        let cur = tobreaks[j]
                        let block = World.getBlock(cur.x, cur.y, cur.z)
                        let state = block.getBlockStateHelper()
                        let statemap = state.toMap()
                        if (state.blocksMovement() && state.isSolid()
                            && !state.isReplaceable() && !state.hasRandomTicks()
                            && !statemap.containsKey('open')
                            && !statemap.containsKey('waterlogged')
                            && block.getBlockPos().distanceTo(goal.x, goal.y, goal.z) > 1) {
                            this.hud.addPoint(
                                cur.x + 0.5, cur.y + 0.5, cur.z + 0.5,
                                0.5, colors.block, 20, cull)
                        }
                    }
                }
                // this.hud.addLine(
                //     prev.x + 0.5, prev.y + 0.2 + 0.01, prev.z + 0.5,
                //     next.x + 0.5, next.y + 0.2 + 0.01, next.z + 0.5,
                //     colors.line, 255, cull)
                this.dashRender.draw(prev, next, colors.line, cull)
            }
        }
        return this
    }
}

const DataStore = {
    path: 'D:/games/Minecraft/jsmacros/build/loot_chest.json',
    data: {},
    scanner: World.getWorldScanner().withStringBlockFilter().contains(block_ids).build(),
    load() {
        if (!FS.exists(this.path))
            this.save()
        let input = JSON.parse(FS.open(this.path).read())
        this.data = {}
        Object.keys(input).forEach(k => this.data[k] = new Set(input[k]))
        return this
    },
    getDimension() {
        return World.getDimension()
    },
    add(item) {
        let dim = this.getDimension()
        if (dim in this.data)
            this.data[dim].add(item)
        else
            this.data[dim] = new Set([item])
        this.save()
    },
    has(item) {
        return this.data[this.getDimension()]?.has(item) ?? false
    },
    save() {
        let output = {}
        Object.keys(this.data).forEach(k => {
            output[k] = Array.from(this.data[k])
        })
        FS.open(this.path).write(JSON.stringify(output))
    },
    scanAroundPlayer() {
        return this.scanner.scanAroundPlayer(3)
    }
}

const bot = new BaritoneUtils().registerHud()
let lastest_goal = null

function getInfos() {
    let old_boxs = Array.from(d3d.getBoxes().toArray())
    d3d.getTraceLines().forEach(v => d3d.removeTraceLine(v))

    let blocks = DataStore.scanAroundPlayer()
    let player = Player.getPlayer()
    let start_pos = player.getBlockPos()
    let nearest = null
    let nearest_display = '无'

    if (blocks.size() > 0) {
        for (let pos of blocks) {
            let pos_sign = `${pos.x} ${pos.y} ${pos.z}`
            if (DataStore.has(pos_sign))
                continue
            d3d.addBox(
                pos.x, pos.y, pos.z, pos.x + 1, pos.y + 1, pos.z + 1,
                0xeb3b5a, 255, 0xeb3b5a, 0, true, false)
            // 曼哈顿距离，不考虑坐标方块类型
            let src_pos = player.getBlockPos()
            let weight = { y: 3 }
            let distance = bot.manhattan(src_pos.toPos3D(), pos, weight)
            if (!nearest || distance < bot.manhattan(src_pos.toPos3D(), nearest, weight))
                nearest = pos
        }
    }

    if (nearest) {
        // Chat.log(nearest)
        let cur_goal = `[${start_pos.getX()} ${start_pos.getY()} ${start_pos.getZ()}]->[${nearest.x} ${nearest.y} ${nearest.z}]`
        let dist = bot.manhattan(ConvertToPos3D(player.getBlockPos()), nearest)
        if (lastest_goal != cur_goal) {
            let res = bot.findPath(start_pos, nearest)
            if (`${res.type}`?.startsWith('SUCCESS')) {
                if (res.positions().length > 2) {
                    bot.renderPath(res)
                    dist = res.getDistance()
                }
                else {
                    bot.removeAllElements()
                    d3d.addTraceLine(nearest, 0xf1c40f)
                }
            } else {
                d3d.addTraceLine(nearest, 0xf1c40f)
            }
            lastest_goal == cur_goal
        }
        nearest_display = `${cur_goal}(直线距离: ${dist.toFixed(0)}m)`
    } else {
        bot.removeAllElements()
    }
    old_boxs.forEach(v => d3d.removeBox(v))
    return [
        `扫描数量：${d3d.getBoxes().size()}个`,
        `最近坐标：${nearest_display}`
    ]
}

function main() {
    Hud.clearDraw2Ds()
    d2d.setOnInit(JavaWrapper.methodToJava(() => {
        let infos = getInfos()
        for (let i = 0; i < infos.length; i++) {
            display_panel.push(d2d.addText(
                infos[i],
                d2d_setting.x, d2d_setting.y - Math.round(d2d_setting.scale * 10) * (infos.length - i),
                d2d_setting.color, d2d_setting.shadow,
                d2d_setting.scale, d2d_setting.rotation))
        }
    }))
    d2d.register()
    d3d.register()
    DataStore.load()

    right_click_listener = JsMacros.on("InteractBlock", JavaWrapper.methodToJava((e, ctx) => {
        let id = `${e.block.getId()}`
        if (block_ids.filter(v => id.includes(v)).length > 0) {
            let pos = e.block.getBlockPos()
            let pos_sign = `${pos.getX()} ${pos.getY()} ${pos.getZ()}`
            DataStore.add(pos_sign)
        }
    }))
    try {
        while (isToggle()) {
            let infos = getInfos()
            for (let i = 0; i < infos.length; i++)
                display_panel[i]?.setText(infos[i])
            Client.waitTick(3)
        }
    } catch (error) {
        mclog(error)
        setToggle(!isToggle())
    } finally {
        Hud.clearDraw2Ds()
        Hud.clearDraw3Ds()
        if (right_click_listener)
            JsMacros.off(right_click_listener)
    }
}

if (isToggle())
    main()
