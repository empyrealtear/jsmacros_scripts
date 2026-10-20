// 脚本名称: 自然罗盘-自定义搜索起点
// 适配版本：forge 1.20.1
// 功能介绍: 把指定中心坐标发包给服务端搜索群系
// 依赖模组: jsmacros、自然罗盘（Nature's Compass）、Xaero地图
// 更新内容: v1.0 初始化脚本

const scriptName = file.getName().replace(/\.(js|ts)$/, '')
const _session = `${scriptName}:session`
const _enabled = `${scriptName}:enabled`
const session = GlobalVars.incrementAndGetInt(_session)
const _listener = {
    tick: null, counter: 0, step: 3, offHandle: null,
    on(handle) {
        this.tick = JsMacros.on('Tick', JavaWrapper.methodToJava(() => {
            if (!isEnabled()) return this.off()
            if (++this.counter % this.step != 0) return
            handle?.()
        }))
        return this
    },
    off() { this.offHandle?.(); this.tick && JsMacros.off(this.tick); this.tick = null; return this }
}
const mclog = (msg, color = 7) => Chat.log(`§7[§5${scriptName}§7] §${(color % 16).toString(16)}${msg}`)
const isEnabled = () => GlobalVars.getBoolean(_enabled) && GlobalVars.getInt(_session) == session
const toggleEnabled = (v) => mclog(GlobalVars.putBoolean(_enabled, v ?? !isEnabled()) ? "启用" : "关闭")

/** 反射工具 @template T */
class DeobfRef {
    /** 探测类名
     * @param {string[]} names 候选名
     * @returns {string?}
     */
    static className(...names) {
        for (const n of names)
            try { return Reflection.getClass(n).getName() } catch { }
        return null
    }
    /**
     * 探测字段名
     * @param {string} cls
     * @param {string[]} names 候选名
     * @returns {string?}
     */
    static fieldName(cls, ...names) {
        const fields = Reflection.getClass(cls).getDeclaredFields()
        for (let n of names)
            for (let m of fields)
                if (m.getName() === n) return n
        return null
    }
    /**
     * 探测方法名
     * @param {string} cls
     * @param {string[]} names 候选名
     * @returns {string?}
     */
    static methodName(cls, ...names) {
        const methods = Reflection.getClass(cls).getDeclaredMethods()
        for (let n of names)
            for (let m of methods)
                if (m.getName() === n) return n
        return null
    }
    /**
     * 按顺序尝试加载类，返回第一个成功的
     * @template {string} C
     * @param {C[]} class_names
     * @returns {GetJava.Type$Graal<C>?}
     */
    static type(...class_names) {
        for (let item of class_names)
            try { return Java.type(item) } catch { }
        return null
    }
    /**
     * 获取类并包装为 DeobfRef
     * @template {string} C
     * @param {C[]} class_names
     * @returns {DeobfRef<C>?}
     */
    static class(...class_names) {
        let type = this.type(...class_names)
        return type ? new this(type) : null
    }

    /** @param {T} v 被反射包装的对象或 Java 类 */
    constructor(v) { /** @type {T} */ this.target = v }
    /** @returns {Packages.org.joor.Reflect} */
    get reflect() { return this._reflect ??= this.target ? Reflection.getReflect(this.target) : null }
    /** @returns {string} 类名 */
    get classname() { return this.target ? Reflection.getClassName(this.target) : null }
    /** @returns {GetJava.Type$Graal<T>} Graal 版 Java 类 */
    get type() { return this.classname ? Java.type(this.classname) : null }
    /** @returns {JavaClass<T>} 反射版 Java 类 */
    get class() { return this.classname ? Reflection.getClass(this.classname) : null }
    /** @returns {string[]} 所有字段名（缓存） */
    get fields() { return this._fields ??= this.class?.getDeclaredFields().map(v => v.getName()) ?? [] }
    /** @returns {string[]} 所有方法名（缓存） */
    get methods() { return this._methods ??= this.class?.getDeclaredMethods().map(v => v.getName()) ?? [] }
    /** @returns {JavaClass<any>} 父类 */
    get parent() { return this.class?.getSuperclass() }

    /**
     * 获取第一个存在的字段名
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {string?}
     */
    fieldName(...names) {
        for (let name of names)
            if (this.fields.includes(name)) return name
        return null
    }
    /**
     * 获取字段值
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {*} 字段值；未找到返回 null
     */
    get(...names) {
        let name = this.fieldName(...names)
        if (name)
            try { return this.reflect.field(name).get() }
            catch { return this.target[name] }
        return null
    }
    /**
     * 获取字段值
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {DeobfRef} 字段值；未找到返回 null
     */
    $get(...names) {
        let res = this.get(...names)
        return res == null ? null : new DeobfRef(res)
    }
    /**
     * 设置字段值
     * @param {*} value 新值
     * @param {string[]} names 候选字段名（按优先级）
     * @returns {*} 设置后的字段值；未找到返回 null
     */
    set(value, ...names) {
        let name = this.fieldName(...names)
        if (name)
            try { return this.reflect.set(name, value).get() }
            catch { return this.target[name] = value, this.target[name] }
        return null
    }
    /**
     * 获取第一个存在的方法名
     * @param {string[]} method_names 候选方法名（按优先级）
     * @returns {string?}
     */
    methodName(...method_names) {
        for (let name of method_names)
            if (this.methods.includes(name))
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
     * 按方法名调用
     * @param {string} method_name 方法名
     * @param {*[]} args 参数列表
     * @returns {DeobfRef} 方法返回值
     */
    $invoke(method_name, ...args) {
        let res = this.invoke(method_name, ...args)
        return res == null ? null : new DeobfRef(res)
    }
    /**
     * 按候选方法名调用
     * @param {string[]} method_names 候选方法名（按优先级）
     * @param {*[]} args 参数列表
     * @returns {*} 方法返回值；未找到返回 null
     */
    call(method_names, ...args) {
        let name = this.methodName(...method_names)
        return name ? this.invoke(name, ...args) : null
    }
    /**
     * 按候选方法名调用
     * @param {string[]} method_names 候选方法名（按优先级）
     * @param {*[]} args 参数列表
     * @returns {DeobfRef} 方法返回值；未找到返回 null
     */
    $call(method_name, ...args) {
        let res = this.call(method_name, ...args)
        return res == null ? null : new DeobfRef(res)
    }
}

try {
    JsMacros.assertEvent(event, 'Service')
    event.stopListener = JavaWrapper.methodToJava(() => { _listener.off(); toggleEnabled(false) })
    toggleEnabled(true)
} catch { toggleEnabled() }



// https://github.com/MattCzyr/NaturesCompass/blob/forge-1.20.1/src/main/java/com/chaosthedude/naturescompass/gui/NaturesCompassScreen.java
const Compass = {
    $id: 'naturescompass:naturescompass',
    $ResourceLocation: DeobfRef.type('net.minecraft.resources.ResourceLocation',
        'net.minecraft.class_2960', 'net.minecraft.util.Identifier', 'net.minecraft.src.C_5265_'),
    $NaturesCompass: Java.type('com.chaosthedude.naturescompass.NaturesCompass'),
    $SearchPacket: Java.type('com.chaosthedude.naturescompass.network.CompassSearchPacket'),
    screentype: 'com.chaosthedude.naturescompass.gui.NaturesCompassScreen',
    sendPacket(biomeid, x, z) {
        let pos = PositionCommon.createBlockPos(x, (Math.random() * 20 + 63) | 0, z).getRaw()
        this.$NaturesCompass.network.sendToServer(new this.$SearchPacket(new this.$ResourceLocation(`${biomeid}`), pos))
        Reflection.getReflect(this.$NaturesCompass).synced = true
    }
}

const Waypoint = {
    $XaeroMinimapSession: DeobfRef.type('xaero.common.XaeroMinimapSession'),
    $WaypointsManager: DeobfRef.type('xaero.common.minimap.waypoints.WaypointsManager'),
    $Waypoint: DeobfRef.type('xaero.common.minimap.waypoints.Waypoint'),
    getWaypointsManager() { return this.$XaeroMinimapSession.getCurrentSession().getWaypointsManager() },
    getCurrentWorld() { return this.getWaypointsManager().getCurrentWorld() },
    getCustomWaypoints(groupName) { return this.$WaypointsManager.getCustomWaypoints(groupName) },
    createWaypoint(x, y, z, name, shortName, color) {
        return new this.$Waypoint(x | 0, y | 0, z | 0, name, shortName, color ?? Math.floor(Math.random() * 16))
    },
    addWaypointSet(key) {
        let manager = this.getCurrentWorld()
        let table = manager.getWaypointSet(key)
        if (table) return table
        manager.addWaypointSet(key)
        return manager.getWaypointSet(key)
    },
    removeWaypointSet(key) {
        return this.getCurrentWorld().removeWaypointSet(key)
    }
}


if (isEnabled()) {
    let listenters = []
    listenters.push(JsMacros.on('OpenScreen', JavaWrapper.methodToJava((e, ctx) => {
        let screen = Hud.getOpenScreen()
        if (screen && Reflection.getClassName(screen) == Compass.screentype) {
            Client.runOnMainThread(JavaWrapper.methodToJava(() => {
                screen.getWidth(), screen.getHeight()
            }), true, 3000)
            const toNumber = (str) => { let n = parseInt(str); return Number.isFinite(n) ? n : null }
            let scale = Hud.getScaleFactor()
            let width = Hud.getWindowWidth() / scale, height = Hud.getWindowHeight() / scale
            let playerPos = Player.getPlayer().getBlockPos()
            let pos = { x: playerPos.getX(), z: playerPos.getZ() }
            let input_x = screen.addTextInput(10, (height - 120) | 0, 110, 15, '',
                JavaWrapper.methodToJava((v) => { pos.x = toNumber(v) ?? playerPos.getX() }))
            screen.textBuilder().text('X').align(input_x, 'CenterOnCenter', 'CenterOnCenter')
                .x(input_x.getX() - 8).buildAndAdd()
            let input_z = screen.addTextInput(10, (height - 100) | 0, 110, 15, '',
                JavaWrapper.methodToJava((v) => { pos.z = toNumber(v) ?? playerPos.getZ() }))
            screen.textBuilder().text('Z').align(input_z, 'CenterOnCenter', 'CenterOnCenter')
                .x(input_z.getX() - 8).buildAndAdd()
            screen.addButton(10, (height - 80) | 0, 110, 18, '自定义搜索', JavaWrapper.methodToJava((btn) => {
                let getSelected = DeobfRef.methodName(DeobfRef.className(
                    'net.minecraft.client.gui.components.AbstractSelectionList', 'net.minecraft.class_350',
                    'net.minecraft.client.gui.widget.EntryListWidget', 'net.minecraft.src.C_3443_'
                ), 'getSelected', 'method_25334', 'getSelectedOrNull', 'm_93511_')
                let biomekey = new DeobfRef(screen).$get('selectionList')?.$invoke(getSelected)?.call(['getBiomeKey'])
                if (biomekey) {
                    Compass.sendPacket(`${biomekey}`, pos.x | 0, pos.z | 0)
                    screen.close()
                }
            })).addTooltip('需先填入搜索中心坐标，默认为玩家坐标')
            screen.addButton(10, (height - 60) | 0, 110, 18, '添加路径点', JavaWrapper.methodToJava((btn) => {
                let player = Player.getPlayer()
                for (let item of [player.getMainHand(), player.getOffHand()])
                    if (item.getItemId() == Compass.$id) {
                        let nbt = item.getNBT()
                        let biome = nbt.resolve('BiomeKey')[0].asString()
                        let biomeName = Chat.createTextHelperFromTranslationKey('biome.' + biome.replace(':', '.')).getString()
                        let x = nbt.resolve('FoundX')[0].asNumberHelper().asInt()
                        let z = nbt.resolve('FoundZ')[0].asNumberHelper().asInt()
                        let set = Waypoint.addWaypointSet('自然罗盘')
                        let point = Waypoint.createWaypoint(x, 64, z, biomeName, biomeName[0])
                        set.add(point)
                        break
                    }
            })).addTooltip('添加到自然罗盘组路径点')
        }
    })))

    _listener.on(() => {
        // 循环代码
    }).offHandle = () => {
        listenters.forEach(v => JsMacros.off(v))
        listenters = []
    }
}
