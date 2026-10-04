// 脚本名称: 机械动力:柴油动力油田扫描
// 功能介绍: 在存档中模拟计算柴油动力油田储量，并保存到本地
// 依赖模组: 宏(jsmacros)、机械动力:柴油动力(Create: Diesel Generators)

const scriptName = 'CreateOilScanner.ToggleScript'
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
    mclog(value ? "启用脚本" : "关闭脚本")
}
setToggle(!isToggle())

/** 反射工具 @template T */
class DeobfRef {
    /** @param {T} v 被反射包装的对象或 Java 类 */
    constructor(v) {
        /** @type {T} */
        this.target = v
        /** @type {Packages.org.joor.Reflect} */
        this.reflect = Reflection.getReflect(this.target)
    }

    /**
     * 尝试按顺序加载类，返回第一个成功的
     * @template {string} C
     * @param {C[]} class_names 候选类名
     * @returns {GetJava.Type$Graal<C>|null}
     */
    static Type(...class_names) {
        for (let item of class_names)
            try { return Java.type(item) } catch { }
        return null
    }

    /**
     * 获取类并包装为 DeobfRef
     * @template {string} C
     * @param {C[]} class_names 候选类名
     * @returns {DeobfRef<C>|null}
     */
    static Class(...class_names) {
        let type = DeobfRef.Type(...class_names)
        return type ? new DeobfRef(type) : null
    }

    /** 获取类名 @returns {string} */
    get classname() { return Reflection.getClassName(this.target) }

    /** 获取 Java 类（Graal 版） @returns {GetJava.Type$Graal<T>} */
    get type() { return Java.type(Reflection.getClassName(this.target)) }

    /** 获取 Java 类（反射版） @returns {JavaClass<T>} */
    get class() { return Reflection.getClass(Reflection.getClassName(this.target)) }

    /** 获取所有字段名（缓存） @returns {string[]} */
    get fields() { return this._fields ??= this.class.getDeclaredFields().map(v => v.getName()) }

    /** 获取所有方法名（缓存） @returns {string[]} */
    get methods() { return this._methods ??= this.class.getDeclaredMethods().map(v => v.getName()) }

    /** 获取父类 @returns {JavaClass<any>} */
    get parent() { return this.class.getSuperclass() }

    /**
     * 获取第一个存在的字段名
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {string|null}
     */
    getFieldName(...names) {
        let fields = this.fields
        for (let name of names)
            if (fields.includes(name)) return name
        return null
    }

    /**
     * 获取字段值
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {*} 字段值；未找到返回 null
     */
    get(...names) {
        let name = this.getFieldName(...names)
        if (name)
            try { return this.reflect.field(name).get() }
            catch { return this.target[name] }
        return null
    }

    /**
     * 设置字段值
     * @param {*} value 新值
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {*} 设置后的字段值；未找到返回 null
     */
    set(value, ...names) {
        let name = this.getFieldName(...names)
        if (name)
            try { return this.reflect.set(name, value).get() }
            catch {
                this.target[name] = value
                return this.target[name]
            }
        return null
    }

    /**
     * 获取第一个存在的方法名
     * @param {string[]} method_names 候选方法名（按优先级）
     * @returns {string|null}
     */
    getMethodName(...method_names) {
        let methods = this.methods
        for (let name of method_names)
            if (methods.includes(name))
                return name
        return null
    }

    /**
     * 按方法名调用
     * @param {string} method_name 方法名
     * @param {*[]} args 参数列表
     * @returns {*} 方法返回值
     */
    invoke(method_name, ...args) {
        try {
            return args.length == 0 ?
                this.reflect.call(method_name).get() :
                this.reflect.call(method_name, ...args).get()
        } catch {
            return this.target[method_name]?.(...args)
        }
    }

    /**
     * 按候选方法名调用
     * @param {string[]} method_names 候选方法名（按优先级）
     * @param {*[]} args 参数列表
     * @returns {*} 方法返回值；未找到返回 null
     */
    call(method_names, ...args) {
        let name = this.getMethodName(...method_names)
        return name ? this.invoke(name, ...args) : null
    }
}

// ==================== Java 类引用 ====================
/** @type {JavaClass<ChunkPos>} */
const ChunkPos = Java.type('net.minecraft.world.level.ChunkPos')
/** @type {JavaClass<OilChunksSavedData>} */
const OilChunksSavedData = Java.type('com.jesz.createdieselgenerators.world.OilChunksSavedData')
/** @type {DeobfRef<PerlinNoise>|null} */
const PerlinNoise = DeobfRef.Class('net.minecraft.world.level.levelgen.synth.PerlinNoise')
/** @type {DeobfRef<RandomSource>|null} */
const RandomSource = DeobfRef.Class('net.minecraft.util.RandomSource')
/** @type {JavaClass<CDGConfig>} */
const CDGConfig = Java.type('com.jesz.createdieselgenerators.CDGConfig')
/** @type {JavaClass<CDGTags>} */
const CDGTags = DeobfRef.Type('com.jesz.createdieselgenerators.CDGTags')

// ==================== Hud2D 进度条 ====================
/**
 * Hud2D 双行进度条
 * @typedef {Object} ProgressHudType
 * @property {Draw2D|null} d2d Draw2D 实例
 * @property {IText|null} line1 第一行文本
 * @property {IText|null} line2 第二行文本
 * @property {boolean} _positioned 是否已定位到左下角
 */
const ProgressHud = {
    /** @type {Draw2D|null} */
    d2d: null,
    /** @type {IText|null} */
    line1: null,
    /** @type {IText|null} */
    line2: null,
    /** @type {boolean} */
    _positioned: false,
    /** @type {number} */
    _latestUpdate: -1,

    /** 初始化 HUD @returns {typeof ProgressHud} */
    init() {
        Hud.clearDraw2Ds()
        this.d2d = Hud.createDraw2D()
        this.d2d.setOnInit(JavaWrapper.methodToJava(() => {
            this.line1 = this.d2d.addText('', 5, 5, 0xFFFF00, true)
            this.line2 = this.d2d.addText('', 5, 18, 0xAAAAAA, true)
        }))
        this.d2d.register()
        return this
    },

    /** 定位到左下角 */
    positionBottomLeft() {
        if (this._positioned || !this.line1) return
        try {
            const screenH = this.d2d.getHeight()
            const baseY = screenH - 30
            this.line1.setPos(5, baseY)
            this.line2.setPos(5, baseY + 13)
            this._positioned = true
        } catch (e) {
            this._positioned = true
        }
    },

    /**
     * 显示两行
     * @param {string} msg1 第一行
     * @param {string} [msg2] 第二行
     */
    show(msg1, msg2) {
        if (!this.line1) return
        this.positionBottomLeft()
        this.line1.setText(msg1)
        this.line2.setText(msg2 ?? '')
    },

    /**
     * 更新两行
     * @param {string} msg1 第一行
     * @param {string} [msg2] 第二行
     */
    update(msg1, msg2, force = false) {
        if (force || Date.now() - this._latestUpdate > 100) {
            if (!this.line1) return
            this.positionBottomLeft()
            this.line1.setText(msg1)
            this.line2.setText(msg2 ?? '')
            this._latestUpdate = Date.now()
        }
    },

    /** 隐藏 HUD */
    hide() {
        if (!this.line1) return
        this.line1.setText('')
        this.line2.setText('')
    }
}

// ==================== 缓存 ====================
/**
 * 油田缓存存储
 * @typedef {Object} OilStoreType
 * @property {string} path 缓存文件路径
 * @property {Object} data 缓存数据，结构：
 *   {
 *     timestamp: number,
 *     time: string,
 *     OIL_CHUNK_INFINITE_THRESHOLD: number,
 *     OIL_CHUNK_THRESHOLD: number,
 *     OIL_CHUNK_SCALE: number,
 *     dimensions: { [dim: string]: { 'x z': number } }
 *   }
 */
const OilStore = {
    /** @type {string} */
    path: 'cdg_oil_cache.json',
    /** @type {Object} */
    data: {
        timestamp: 0,
        time: '',
        OIL_CHUNK_INFINITE_THRESHOLD: 0,
        OIL_CHUNK_THRESHOLD: 0,
        OIL_CHUNK_SCALE: 0,
        dimensions: {}
    },

    /** 加载缓存文件 @returns {typeof OilStore} */
    load() {
        if (!FS.exists(this.path)) {
            this.data = {
                timestamp: Date.now(),
                time: new Date().toISOString(),
                OIL_CHUNK_INFINITE_THRESHOLD: CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get(),
                OIL_CHUNK_THRESHOLD: CDGConfig.OIL_CHUNK_THRESHOLD.get(),
                OIL_CHUNK_SCALE: CDGConfig.OIL_CHUNK_SCALE.get(),
                dimensions: {}
            }
            this.save()
            return this
        }
        try {
            const raw = JSON.parse(FS.open(this.path).read())
            // 确保 dimensions 存在
            if (!raw.dimensions) raw.dimensions = {}
            this.data = raw
        } catch (e) {
            this.data = {
                timestamp: Date.now(),
                time: new Date().toISOString(),
                OIL_CHUNK_INFINITE_THRESHOLD: CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get(),
                OIL_CHUNK_THRESHOLD: CDGConfig.OIL_CHUNK_THRESHOLD.get(),
                OIL_CHUNK_SCALE: CDGConfig.OIL_CHUNK_SCALE.get(),
                dimensions: {}
            }
            this.save()
        }
        return this
    },

    /** 获取当前维度 @returns {string} */
    getDimension() {
        return World.getDimension()
    },

    /**
     * 生成缓存键（区块坐标）
     * @param {number} x 区块 X
     * @param {number} z 区块 Z
     * @returns {string} "x z"
     */
    key(x, z) {
        return `${x} ${z}`
    },

    /**
     * 检查是否已缓存
     * @param {number} x 区块 X
     * @param {number} z 区块 Z
     * @returns {boolean}
     */
    has(x, z) {
        const dim = this.getDimension()
        return !!(this.data.dimensions[dim] && this.key(x, z) in this.data.dimensions[dim])
    },

    /**
     * 获取缓存值
     * @param {number} x 区块 X
     * @param {number} z 区块 Z
     * @returns {number|undefined}
     */
    get(x, z) {
        const dim = this.getDimension()
        return this.data.dimensions[dim]?.[this.key(x, z)]
    },

    /**
     * 设置缓存值
     * @param {number} x 区块 X
     * @param {number} z 区块 Z
     * @param {number} oil 油量
     */
    set(x, z, oil) {
        const dim = this.getDimension()
        if (!this.data.dimensions[dim]) this.data.dimensions[dim] = {}
        this.data.dimensions[dim][this.key(x, z)] = oil
    },

    /** 写入缓存文件 */
    save() {
        this.data.timestamp = Date.now()
        this.data.time = new Date().toISOString()
        this.data.OIL_CHUNK_INFINITE_THRESHOLD = CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get()
        this.data.OIL_CHUNK_THRESHOLD = CDGConfig.OIL_CHUNK_THRESHOLD.get()
        this.data.OIL_CHUNK_SCALE = CDGConfig.OIL_CHUNK_SCALE.get()
        FS.open(this.path).write(JSON.stringify(this.data, null, 4))
    }
}

// ==================== 油量查询 ====================
/**
 * 油田查询核心
 * @typedef {Object} CDGOilType
 * @property {ServerLevel|null} level 主世界 ServerLevel
 */
const CDGOil = {
    /** @type {ServerLevel|null} */
    level: null,
    /** @type {Object[]|null} */
    _topSamples: null,

    /** 初始化 @returns {typeof CDGOil} */
    init() {
        this.level = this.getOverworld()
        OilStore.load()
        ProgressHud.init()
        return this
    },

    /** 获取主世界 ServerLevel @returns {ServerLevel} */
    getOverworld() {
        const mc = Client.getMinecraft()
        const server = Reflection
            .getClass('net.minecraft.client.Minecraft').getDeclaredMethod('m_91092_')
            .invoke(mc)
        return Reflection
            .getClass('net.minecraft.server.MinecraftServer').getDeclaredMethod('m_129783_')
            .invoke(server)
    },

    /** 获取世界种子 @returns {bigint} */
    getSeed() {
        return new DeobfRef(this.level).call(['getSeed', 'method_8412', 'm_7328_'])
    },

    /**
     * 获取方块坐标处的群系
     * @param {number} x 方块坐标 X
     * @param {number} z 方块坐标 Z
     * @returns {Holder<Biome>} 群系 Holder
     */
    getNoiseBiome(x, z) {
        return new DeobfRef(this.level).call(
            ['getUncachedNoiseBiome', 'method_22387', 'getGeneratorStoredBiome', 'm_203675_'],
            x >> 2, 64 >> 2, z >> 2)
    },

    /**
     * 获取区块储油量（完整群系采样）
     * @param {number} x 区块 X
     * @param {number} z 区块 Z
     * @returns {number} 储油量 (mB)
     */
    getBaseOilAmount(x, z) {
        return OilChunksSavedData.getBaseOilAmount(this.level, new ChunkPos(x, z))
    },

    /**
     * 获取区块储油量（仅采样区块左上角群系，速度快但精度略低）
     * @param {number} x 区块 X
     * @param {number} z 区块 Z
     * @returns {number} 储油量 (mB)；0 表示无油，2147483647 表示无限
     */
    getBaseOilAmountFast(x, z) {
        let biome = CDGOil.getNoiseBiome(x * 16, z * 16)
        if (CDGTags?.DENY_OIL_BIOMES && biome.containsTag(CDGTags.DENY_OIL_BIOMES))
            return 0

        let isHighInOil = CDGTags?.OIL_BIOMES && biome.containsTag(CDGTags.OIL_BIOMES)
        if ((isHighInOil && CDGConfig.DISABLE_HIGH_OIL_CHUNKS?.get()) ||
            (!isHighInOil && CDGConfig.DISABLE_NORMAL_OIL_CHUNKS?.get()))
            return 0

        let seed = this.getSeed()
        let scale = CDGConfig.OIL_CHUNK_SCALE.get()
        let randomSource = RandomSource.call(['create', 'method_43049', 'm_216335_'], seed)
        let noise = PerlinNoise.call(
            ['create', 'method_39127', 'm_230529_'],
            randomSource, [-2, -1, 0, 1])
        let n = new DeobfRef(noise).call(
            ['getValue', 'method_15416', 'sample', 'm_75408_'],
            x * scale, 0, z * scale)

        let max = 7000000 * (isHighInOil ? CDGConfig.HIGH_OIL_MULTIPLIER.get() : CDGConfig.OIL_MULTIPLIER.get())
        let amount = Math.floor(Math.pow((n + 1) / 1.6, 2) * max)
        if (amount < CDGConfig.OIL_CHUNK_THRESHOLD.get())
            return 0
        if (amount > CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get())
            return 2147483647
        return amount
    },

    /**
     * 两阶段查询：
     *   1. 先用 getBaseOilAmountFast 快速判断
     *   2. 若油量 ≥ 无限阈值，再用 getBaseOilAmount 完整复核
     * @param {number} x 区块 X
     * @param {number} z 区块 Z
     * @returns {number} 储油量 (mB)
     */
    getOilSmart(x, z) {
        if (!isToggle()) throw new Error('StopScript')
        const fast = this.getBaseOilAmountFast(x, z)
        if (fast < CDGConfig.OIL_CHUNK_INFINITE_THRESHOLD.get())
            return fast
        return this.getBaseOilAmount(x, z)
    },

    /**
     * 阶段 1：间隔抽样，快速找高油区块
     * @param {number} cx 中心区块 X
     * @param {number} cz 中心区块 Z
     * @param {number} radius 抽样半径（区块数）
     * @param {number} [step=4] 抽样间隔
     * @returns {{x: number, z: number, oil: number}|null} 最佳采样点；无油返回 null
     */
    coarseScan(cx, cz, radius, step = 4) {
        /** @type {{x: number, z: number, oil: number}[]} */
        const hits = []
        const startTime = Date.now()

        const x0 = cx - radius
        const x1 = cx + radius
        const z0 = cz - radius
        const z1 = cz + radius

        const totalX = Math.floor((x1 - x0) / step) + 1
        const totalZ = Math.floor((z1 - z0) / step) + 1
        const total = totalX * totalZ

        let done = 0
        let cachedCount = 0

        ProgressHud.show('§e阶段1：间隔抽样...', '')

        for (let x = x0; x <= x1; x += step) {
            for (let z = z0; z <= z1; z += step) {
                done++
                if (OilStore.has(x, z)) {
                    cachedCount++
                    hits.push({ x, z, oil: OilStore.get(x, z) })
                } else {
                    const oil = this.getOilSmart(x, z)
                    OilStore.set(x, z, oil)
                    hits.push({ x, z, oil })
                }
                this.renderProgress(done, total, 1, cachedCount, startTime)
                OilStore.save()
            }
            Client.waitTick()
        }

        hits.sort((a, b) => b.oil - a.oil)
        const best = hits[0]

        this.renderProgress(total, total, 1, cachedCount, startTime, true)
        Chat.log(`抽样完成：采样 ${hits.length} 个点，缓存命中 ${cachedCount}`)

        if (!best || best.oil == 0) {
            Chat.log('未找到任何采样点')
            return null
        }

        Chat.log(`最佳采样点：(${best.x}, ${best.z}) 油量 ${best.oil} mB`)
        this._topSamples = hits.slice(0, 3)
        return best
    },

    /**
     * 阶段 2：以高油点为中心，精扫半径内的所有区块
     * @param {number} cx 中心区块 X
     * @param {number} cz 中心区块 Z
     * @param {number} innerRadius 精扫半径（区块数）
     */
    fineScan(cx, cz, innerRadius) {
        const total = (innerRadius * 2 + 1) ** 2
        const startTime = Date.now()

        let done = 0
        let newCount = 0
        let cachedCount = 0

        ProgressHud.show('§e阶段2：局部精扫...', '')

        for (let r = 0; r <= innerRadius; r++) {
            this.scanRing(cx, cz, r, (n, c) => {
                if (n) newCount++
                if (c) cachedCount++
                done++
                this.renderProgress(done, total, 2, cachedCount, startTime)
            })
            Client.waitTick()
        }

        this.renderProgress(done, total, 2, cachedCount, startTime, true)
        Chat.log(`精扫 (${cx}, ${cz}) 完成：新增 ${newCount}，缓存命中 ${cachedCount}`)
    },

    /**
     * 扫描第 r 圈（正方形环）
     * @param {number} cx 中心区块 X
     * @param {number} cz 中心区块 Z
     * @param {number} r 第几圈
     * @param {(isNew: boolean, isCached: boolean) => void} onChunk 每个区块的回调
     */
    scanRing(cx, cz, r, onChunk) {
        if (r === 0) {
            this.processChunk(cx, cz, onChunk)
            OilStore.save()
            return
        }
        for (let x = cx - r; x <= cx + r; x++) {
            this.processChunk(x, cz - r, onChunk)
        }
        for (let x = cx - r; x <= cx + r; x++) {
            this.processChunk(x, cz + r, onChunk)
        }
        for (let z = cz - r + 1; z <= cz + r - 1; z++) {
            this.processChunk(cx - r, z, onChunk)
        }
        for (let z = cz - r + 1; z <= cz + r - 1; z++) {
            this.processChunk(cx + r, z, onChunk)
        }
        OilStore.save()
    },

    /**
     * 处理单个区块：已缓存则跳过，否则计算并写入
     * @param {number} x 区块 X
     * @param {number} z 区块 Z
     * @param {(isNew: boolean, isCached: boolean) => void} onChunk 回调
     */
    processChunk(x, z, onChunk) {
        if (OilStore.has(x, z)) {
            onChunk(false, true)
            return
        }
        const oil = this.getOilSmart(x, z)
        OilStore.set(x, z, oil)
        onChunk(true, false)
    },

    /**
     * 两阶段扫描入口
     * @param {number} cx 中心区块 X
     * @param {number} cz 中心区块 Z
     * @param {number} outerRadius 阶段 1 抽样半径
     * @param {number} [innerRadius=5] 阶段 2 精扫半径
     * @param {number} [step=4] 抽样间隔
     * @param {number} [topN=1] 对前 N 个最佳点做精扫
     */
    scanTwoPhase(cx, cz, outerRadius, innerRadius = 5, step = 4, topN = 1) {
        Chat.log(`开始两阶段扫描：中心 (${cx}, ${cz})，抽样半径 ${outerRadius}，精扫半径 ${innerRadius}，间隔 ${step}，精扫前 ${topN} 名`)

        const best = this.coarseScan(cx, cz, outerRadius, step)
        if (!best) return

        const samples = (this._topSamples || [best]).filter(v => v.oil > 0).slice(0, topN)
        for (let i = 0; i < samples.length; i++) {
            const s = samples[i]
            Chat.log(`精扫 ${i + 1}/${samples.length}：(${s.x}, ${s.z}) 油量 ${s.oil} mB`)
            this.fineScan(s.x, s.z, innerRadius)
        }

        const top = this.topOil(5)
        Chat.log(`前 5 名：\n` + top.map(v =>
            `[${v.dim}] (${v.x}, ${v.z}): ${v.oil}mB`
        ).join('\n'))

        Time.sleep(2000)
        ProgressHud.hide()
    },

    /**
     * 渲染进度条
     * @param {number} done 已完成数
     * @param {number} total 总数
     * @param {number} phase 阶段编号
     * @param {number} cachedCount 缓存命中数
     * @param {number} startTime 起始时间戳
     * @param {boolean} [finish=false] 是否已完成
     */
    renderProgress(done, total, phase, cachedCount, startTime, finish = false) {
        const width = 10
        const ratio = done / total
        const filled = Math.round(width * ratio)
        const bar = '█'.repeat(filled) + '░'.repeat(width - filled)

        const elapsed = (Date.now() - startTime) / 1000
        const remain = elapsed > 0 && done > 0
            ? ((total - done) * elapsed / done).toFixed(0)
            : '?'

        const line1 = `§e${bar} §f${done}/${total} §7阶段§f${phase}`

        const line2 = finish
            ? `§a✓ §7缓存§f${cachedCount}`
            : `§7缓存§f${cachedCount} §7剩§f${remain}s`

        ProgressHud.update(line1, line2, ratio == 1)
    },

    /**
     * 缓存中油量最高的 n 个区块
     * @param {number} [n=5] 返回数量
     * @param {number} [minOil=0] 最小油量过滤
     * @returns {{dim: string, x: number, z: number, oil: number}[]}
     */
    topOil(n = 5, minOil = 0) {
        /** @type {{dim: string, x: number, z: number, oil: number}[]} */
        const list = []
        for (const dim in OilStore.data.dimensions) {
            const chunkMap = OilStore.data.dimensions[dim]
            for (const key in chunkMap) {
                const oil = chunkMap[key]
                if (oil <= minOil) continue
                const [x, z] = key.split(' ').map(Number)
                list.push({ dim, x, z, oil })
            }
        }
        return list.sort((a, b) => b.oil - a.oil).slice(0, n)
    },

    /** 清空缓存 */
    clear() {
        OilStore.data.dimensions = {}
        OilStore.save()
    }
}

// ==================== 使用 ====================
if (isToggle()) {
    CDGOil.init()
    
    const player = Player.getPlayer()
    const cx = Math.floor(player.getX() / 16)
    const cz = Math.floor(player.getZ() / 16)
    
    /** 最大抽样半径（区块数） */
    const outerRadius = 200
    /** 抽样间隔 */
    const step = 5
    /** 精扫半径（区块数） */
    const innerRadius = 50
    /** 精扫前 N 个最佳点 */
    const topSample = 10
    try {
        // 抽样 + 精扫
        // CDGOil.scanTwoPhase(cx, cz, outerRadius, innerRadius, step, topSample)
        // 纯精扫
        CDGOil.fineScan(cx, cz, 200)
        // CDGOil.fineScan(-530, 81, 100)
    } catch (e) {
        OilStore.save()
        if (e != 'Error: StopScript')
            setToggle(false)
    } finally {
        if (isToggle())
            setToggle(false)
        Hud.clearDraw2Ds()
    }
}
