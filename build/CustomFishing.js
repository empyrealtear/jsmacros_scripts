// 脚本名称: 星露谷自动钓鱼
// 功能介绍: 检测钓鱼游戏进度，在接近完美时收杆
// 依赖模组: 宏(jsmacros)、CustomFishing插件（服务端）
// 创建时间: 2025-03-16
// 修改时间: 2025-03-19
// 当前版本: v1.2
// 更新内容: v1.2 修正字符缩进计算逻辑，为某服增加腐竹自定义标靶
// 更新内容: v1.1 调整参数，缩短点击间隔
// 更新内容: v1.0 初始化脚本

const scriptName = 'CustomFishing.ToggleScript'
const mclog = (preix, msg, preixColor = 0x5, msgColor = 0x7) => {
    Chat.log(Chat.createTextBuilder()
        .append("[").withColor(preixColor).append(preix).withColor(preixColor).append("]").withColor(preixColor)
        .append(" " + msg).withColor(msgColor).build())
}
const isToggle = () => GlobalVars.getBoolean(scriptName)
const setToggle = (value) => {
    GlobalVars.putBoolean(scriptName, value)
    mclog(scriptName, value ? "enabled" : "disabled")
}
setToggle(!isToggle())

// 参数区
const isCustomMode = false
const debug = false

// 星露谷钓鱼：core\src\main\resources\contents\minigame\default.yml
const customfishingfont = {
    "default": {
        b001: { "chars": ["\ub001"], "type": "bitmap", "height": 15, "ascent": 11, "file": "customfishing:font/bars/pointer.png" },
        b002: {
            "chars": ["\ub002"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar1.png",
            "rate": [0, 0, 0, 0.2, 0.6, 1, 0.6, 0.2, 0, 0, 0],
            "width-per-section": 16, "pointer-offset": -183, "pointer-width": 5,
        },
        b003: {
            "chars": ["\ub003"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar2.png",
            "rate": [0, 0.2, 0.6, 1, 0.6, 0.2, 0, 0, 0, 0, 0],
            "width-per-section": 16, "pointer-offset": -183, "pointer-width": 5,
        },
        b004: {
            "chars": ["\ub004"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar3.png",
            "rate": [0, 0, 0, 0, 0, 0.2, 0.6, 1, 0.6, 0.2, 0],
            "width-per-section": 16, "pointer-offset": -183, "pointer-width": 5,
        },
        b005: {
            "chars": ["\ub005"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar4.png",
            "rate": [0, 0, 0.1, 0.1, 0, 0, 0.2, 0.2, 0.6, 0.6, 1, 0.6, 0.2, 0, 0.2, 0.6, 1, 0.6, 0.2, 0.1, 0, 0],
            "width-per-section": 8, "pointer-offset": -183, "pointer-width": 5,
        },
        b006: {
            "chars": ["\ub006"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar5.png",
            "rate": [1, 0, 0.1, 0.2, 0.2, 0.6, 0.6, 1, 0.6, 0.2, 0, 0.2, 0.6, 1, 0.6, 0.2, 0, 1, 0.2, 0.1, 0, 0],
            "width-per-section": 8, "pointer-offset": -183, "pointer-width": 5,
        },
        b007: {
            "chars": ["\ub007"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar6.png",
            "rate": [0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 1, 0, 1, 0, 1, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1],
            "width-per-section": 8, "pointer-offset": -183, "pointer-width": 5,
        },
        b008: {
            "chars": ["\ub008"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar7.png",
            "rate": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0, 0, 1, 0, 0, 0.3, 0.3, 0.3],
            "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
        },
        b009: {
            "chars": ["\ub009"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar8.png",
            "rate": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.2, 0.2, 0.2, 0.6, 1, 0.6, 0.2, 0.2, 0.2, 0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
        },
        b00a: {
            "chars": ["\ub00a"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar9.png",
            "rate": [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
            "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
        },
        b00b: {
            "chars": ["\ub00b"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar_rainbow.png",
            "rate": ['RED', 'ORANGE', 'YELLOW', 'GREEN', 'AQUA', 'BLUE', 'PURPLE'],
            "width-per-section": 16, "pointer-offset": -119, "pointer-width": 5,
        },

        b00c: { "chars": ["\ub00c"], "type": "bitmap", "height": 8, "ascent": 7, "file": "customfishing:font/bars/bar10.png" },
        b012: {
            "chars": ["\ub012"], "type": "bitmap", "height": 6, "ascent": 6, "file": "customfishing:font/bars/judgment_area_easy.png",
            "bar-effective-area-width": 155, "judgment-area-offset": -160, "judgment-area-width": 45
        },
        b013: {
            "chars": ["\ub013"], "type": "bitmap", "height": 6, "ascent": 6, "file": "customfishing:font/bars/judgment_area_normal.png",
            "bar-effective-area-width": 155, "judgment-area-offset": -160, "judgment-area-width": 36
        },
        b014: {
            "chars": ["\ub014"], "type": "bitmap", "height": 6, "ascent": 6, "file": "customfishing:font/bars/judgment_area_hard.png",
            "bar-effective-area-width": 155, "judgment-area-offset": -160, "judgment-area-width": 27
        },

        b011: { "chars": ["\ub011"], "type": "bitmap", "height": 20, "ascent": 12, "file": "customfishing:font/bars/bar11.png" },
        b00d: { "chars": ["\ub00d"], "type": "bitmap", "height": 5, "ascent": 4, "file": "customfishing:font/bars/fish_icon.png" },
        b00e: { "chars": ["\ub00e"], "type": "bitmap", "height": 5, "ascent": 5, "file": "customfishing:font/bars/struggling_fish_icon.png" },
        b00f: { "chars": ["\ub00f"], "type": "bitmap", "height": 5, "ascent": 4, "file": "customfishing:font/bars/struggling_fish_icon.png" },
        b010: { "chars": ["\ub010"], "type": "bitmap", "height": 5, "ascent": 3, "file": "customfishing:font/bars/struggling_fish_icon.png" },
    },

    "offset_chars": {
        f801: { "chars": ["\uf801"], "type": "bitmap", "value": -1, "ascent": -5000, "height": -3, "file": "customfishing:font/base/space_split.png" },
        f802: { "chars": ["\uf802"], "type": "bitmap", "value": -2, "ascent": -5000, "height": -4, "file": "customfishing:font/base/space_split.png" },
        f803: { "chars": ["\uf803"], "type": "bitmap", "value": -4, "ascent": -5000, "height": -6, "file": "customfishing:font/base/space_split.png" },
        f804: { "chars": ["\uf804"], "type": "bitmap", "value": -8, "ascent": -5000, "height": -10, "file": "customfishing:font/base/space_split.png" },
        f805: { "chars": ["\uf805"], "type": "bitmap", "value": -16, "ascent": -5000, "height": -18, "file": "customfishing:font/base/space_split.png" },
        f806: { "chars": ["\uf806"], "type": "bitmap", "value": -32, "ascent": -5000, "height": -34, "file": "customfishing:font/base/space_split.png" },
        f807: { "chars": ["\uf807"], "type": "bitmap", "value": -64, "ascent": -5000, "height": -66, "file": "customfishing:font/base/space_split.png" },
        f808: { "chars": ["\uf808"], "type": "bitmap", "value": -128, "ascent": -5000, "height": -130, "file": "customfishing:font/base/space_split.png" },

        f811: { "chars": ["\uf811"], "type": "bitmap", "value": 1, "ascent": -5000, "height": -1, "file": "customfishing:font/base/space_split.png" },
        f812: { "chars": ["\uf812"], "type": "bitmap", "value": 2, "ascent": -5000, "height": 1, "file": "customfishing:font/base/space_split.png" },
        f813: { "chars": ["\uf813"], "type": "bitmap", "value": 4, "ascent": -5000, "height": 3, "file": "customfishing:font/base/space_split.png" },
        f814: { "chars": ["\uf814"], "type": "bitmap", "value": 8, "ascent": -5000, "height": 7, "file": "customfishing:font/base/space_split.png" },
        f815: { "chars": ["\uf815"], "type": "bitmap", "value": 16, "ascent": -5000, "height": 15, "file": "customfishing:font/base/space_split.png" },
        f816: { "chars": ["\uf816"], "type": "bitmap", "value": 32, "ascent": -5000, "height": 31, "file": "customfishing:font/base/space_split.png" },
        f817: { "chars": ["\uf817"], "type": "bitmap", "value": 64, "ascent": -5000, "height": 63, "file": "customfishing:font/base/space_split.png" },
        f818: { "chars": ["\uf818"], "type": "bitmap", "value": 128, "ascent": -5000, "height": 127, "file": "customfishing:font/base/space_split.png" },
    },
    "icons": {
        b001: { "chars": ["\ub001"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_1.png" },
        b002: { "chars": ["\ub002"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_2.png" },
        b003: { "chars": ["\ub003"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_3.png" },
        b004: { "chars": ["\ub004"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_4.png" },
        b005: { "chars": ["\ub005"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_5.png" },
        b006: { "chars": ["\ub006"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_6.png" },
        b007: { "chars": ["\ub007"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_7.png" },
        b008: { "chars": ["\ub008"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_8.png" },
        b009: { "chars": ["\ub009"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/progress_9.png" },
        b011: { "chars": ["\ub011"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_1.png" },
        b012: { "chars": ["\ub012"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_2.png" },
        b013: { "chars": ["\ub013"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_3.png" },
        b014: { "chars": ["\ub014"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_4.png" },
        b015: { "chars": ["\ub015"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_5.png" },
        b016: { "chars": ["\ub016"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_6.png" },
        b017: { "chars": ["\ub017"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_7.png" },
        b018: { "chars": ["\ub018"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_8.png" },
        b019: { "chars": ["\ub019"], "type": "bitmap", "height": 13, "ascent": 13, "file": "customfishing:font/icons/strain_9.png" },
    },
    getCharsOffset: function (text) {
        let sum = 0
        Array.from(text).map(v => v?.charCodeAt()?.toString(16)).map(v => {
            let val = customfishingfont.offset_chars[v]?.value
            sum += val ?? 0
        })
        return sum
    },
}
const fish_d2d = Hud.createDraw2D()
const fish_d2d_setting = {
    x: 5,
    y: fish_d2d.getHeight() - 2,
    color: 0xFFFFFF,
    shadow: true,
    scale: 0.5,
    rotation: 0
}
const fish_panel = []
let titleListener
let titleContainer = { TITLE: null, SUBTITLE: null, ACTIONBAR: null }
// let mcTickListener

// 函数区
const flog = (val) => {
    if (debug)
        FS.open("D:/Game/Minecraft/jsmacros/typescript/jsmlogs.txt").append(val)
}
const getDecalaredFieldValue = (obj, javaClass, name) => {
    if (obj == null)
        return null

    let field = Reflection.getDeclaredField(javaClass, name)
    field.setAccessible(true)
    return field.get(obj)
}
const getCustomFishInfos = () => {
    let res = {
        time: new Date(), mainHand: null,
        hook: null, isFishing: false, entity: null, hasCaughtFish: false,

        TITLE: titleContainer.TITLE,
        SUBTITLE: titleContainer.SUBTITLE,
        ACTIONBAR: titleContainer.ACTIONBAR,

        game: {
            type: null,
            ui: null,
        },
        value: 0
    }

    res.mainHand = Player.getPlayer().getMainHand()
    res.hook = Player.getPlayer().getFishingBobber()?.getRaw()
    res.isFishing = res.hook == null ? false : true
    res.hasCaughtFish = Player.getPlayer().getFishingBobber()?.hasCaughtFish()
    res.entity = Player.getPlayer().getFishingBobber()?.getHookedEntity()

    let inv = Player.openInventory()
    inv.getSlots(['main', 'hotbar'])?.forEach(i => {
        let slot = inv.getSlot(i)
        let price = slot.getNBT()?.resolve('Price')
        if (price != null) {
            res.value += price[0].asNumberHelper().asFloat()
        }
    })
    res.value = Math.round(res.value * 100) / 100

    if (res.isFishing) {
        if (res.TITLE && res.SUBTITLE) {
            let title = res.TITLE.message.getJson()
            let subtitle = res.SUBTITLE.message.getJson()

            if (/按照提示跳舞/.test(subtitle)) {
                res.game.type = 'DanceGame' // 跳舞游戏
                let actionEnum = {
                    '←': 'key.mouse.left',
                    '→': 'key.mouse.right',
                    '↑': 'key.keyboard.space',
                    '↓': 'key.keyboard.left.shift'
                }
                res.game.ui = {
                    green: '',
                    gold: '',
                    gray: '',
                    action: ''
                }
                JSON.parse(title).extra?.forEach(v => res.game.ui[v.color] = v.text.trim())
                if (res.game.ui.gold.length > 0)
                    res.game.ui.action = actionEnum[res.game.ui.gold]
            } else if (/customfishing\:offset_chars/.test(subtitle)) {
                let data = JSON.parse(subtitle)
                let barChar = data.extra[0].text.charCodeAt().toString(16)
                if (barChar == 'b011') {
                    res.game.type = 'TensionGame' // 拔河游戏
                    // private void showUI() {
                    //     String bar = AdventureHelper.surroundWithMiniMessageFont(barImage, font)
                    //             + OffsetUtils.getOffsetChars(fishOffset + fish_position)
                    //             + AdventureHelper.surroundWithMiniMessageFont((struggling_time > 0 ? strugglingFishImage[struggling_time % strugglingFishImage.length] : fishImage), font)
                    //             + OffsetUtils.getOffsetChars(barEffectiveWidth - fish_position - fishIconWidth);
                    //     strain = Math.max(0, Math.min(strain, ultimateTension));
                    //     hook.getContext().arg(ContextKeys.PROGRESS, tension[(int) ((strain / ultimateTension) * tension.length)]);
                    //     SparrowHeart.getInstance().sendTitle(getPlayer(), AdventureHelper.miniMessageToJson(tip != null && !played ? tip : title.render(hook.getContext())), AdventureHelper.miniMessageToJson(bar), 0, 20, 0);
                    // }
                    if (/customfishing\:icons/.test(title)) {
                        res.game.ui = { progress: JSON.parse(title)?.text?.charCodeAt()?.toString(16) }
                    }
                } else if (barChar == 'b00c') {
                    res.game.type = 'HoldGame' //平衡游戏
                    // private void showUI() {
                    //     String bar = AdventureHelper.surroundWithMiniMessageFont(barImage, font)
                    //             + OffsetUtils.getOffsetChars((int) (judgementAreaOffset + judgement_position))
                    //             + AdventureHelper.surroundWithMiniMessageFont(judgementAreaImage, font)
                    //             + OffsetUtils.getOffsetChars((int) (barEffectiveWidth - judgement_position - judgementAreaWidth))
                    //             + OffsetUtils.getOffsetChars((int) (-barEffectiveWidth - 1 + fish_position))
                    //             + AdventureHelper.surroundWithMiniMessageFont(pointerImage, font)
                    //             + OffsetUtils.getOffsetChars((int) (barEffectiveWidth - fish_position - pointerIconWidth + 1));
                    //     customFishingHook.getContext().arg(ContextKeys.PROGRESS, progress[(int) ((hold_time / time_requirement) * progress.length)]);
                    //     SparrowHeart.getInstance().sendTitle(super.getPlayer(), AdventureHelper.miniMessageToJson(tip != null && !played ? tip : title.render(customFishingHook.getContext())), AdventureHelper.miniMessageToJson(bar), 0, 20, 0);
                    // }
                    let ui = {
                        judgementAreaOffset: customfishingfont.getCharsOffset(data.extra[1].text),
                        pointerOffset: customfishingfont.getCharsOffset(data.extra[3].text),
                        // bar: customfishingfont["default"][barChar],
                        judgementArea: customfishingfont["default"][data.extra[2].text.charCodeAt().toString(16)],
                        // pointer: customfishingfont["default"][data.extra[4].text.charCodeAt().toString(16)],
                    }
                    // "bar-effective-area-width": 155, "judgment-area-offset": -160, "judgment-area-width": 45
                    let judgementPosition = - ui.judgementArea["judgment-area-offset"] + ui.judgementAreaOffset
                    let pointerPosition = - (- judgementPosition - ui.judgementArea["judgment-area-width"] - 1) + ui.pointerOffset
                    res.game.ui = {
                        barChar: barChar,
                        judgementPosition: judgementPosition,
                        pointerPosition: pointerPosition,
                        judgementWidth: ui.judgementArea["judgment-area-width"],
                        judgementAreaOffset: ui.judgementAreaOffset,
                        pointerOffset: ui.pointerOffset,
                    }
                } else {
                    res.game.type = 'AccurateClickGame' // 打靶游戏
                    // private void showUI() {
                    //     String bar = AdventureHelper.surroundWithMiniMessageFont(barImage, font)
                    //             + OffsetUtils.getOffsetChars(pointerOffset + progress)
                    //             + AdventureHelper.surroundWithMiniMessageFont(pointerImage, font)
                    //             + OffsetUtils.getOffsetChars(totalWidth - progress - pointerWidth);
                    //     SparrowHeart.getInstance().sendTitle(getPlayer(), AdventureHelper.miniMessageToJson(sendTitle.render(hook.getContext())), AdventureHelper.miniMessageToJson(bar), 0, 20, 0);
                    // }
                    // public boolean isSuccessful() {
                    //     if (forcedGameResult != null) return forcedGameResult;
                    //     if (isTimeOut) return false;
                    //     int last = progress / widthPerSection;
                    //     return (Math.random() < successRate[last]);
                    // }
                    let progressOffset = customfishingfont.getCharsOffset(data.extra[1].text)
                    let bar = customfishingfont["default"][barChar] ?? { rate: [1] }
                    let pointer = customfishingfont["default"][data.extra[2].text.charCodeAt().toString(16)]
                    let pointerOffset = bar["pointer-offset"]
                    let widthPerSection = bar["width-per-section"]
                    let totalWidth = bar.rate.length * widthPerSection - 1
                    let progress = - pointerOffset + progressOffset
                    // let progress = totalWidth + progressOffset
                    let index = Math.floor(progress / widthPerSection)
                    res.game.ui = {
                        barChar: barChar,
                        progressOffset: progressOffset,
                        progress: progress,
                        index: index,
                        interval: 16 / widthPerSection,
                        rate: bar.rate,
                        // bar: bar,
                        // pointer: pointer
                    }
                }

            } else if (/点击\d+次/.test(title)) {
                res.game.type = 'ClickGame' // 点击游戏
                res.game.ui = {
                    current: null,
                    total: null,
                    time: null
                }
                let titleMatches = /已点击(?<current>\d+)次/.exec(res.TITLE.message.getString())
                if (titleMatches) {
                    res.game.ui.current = parseInt(titleMatches.groups['total'])
                }
                let SubtitleMatches = /左键点击\s*(?<total>\d+)\s*次以获胜。剩余时间\s*(?<time>[\d+])\s*s/.exec(res.SUBTITLE.message.getString())
                if (SubtitleMatches) {
                    res.game.ui.total = parseInt(SubtitleMatches.groups['total'])
                    res.game.ui.time = parseFloat(SubtitleMatches.groups['time'])
                }
            }
        }
    } else {
        titleContainer = { TITLE: null, SUBTITLE: null, ACTIONBAR: null }
    }

    return {
        attrs: res,
        display: [
            // `时间: ${res.time.toLocaleString()}`,
            `主手: ${res.mainHand.getName().getString()}(${res.mainHand.getDurability()}/${res.mainHand.getMaxDurability()})`,
            `钓钩: ${res.hook}`,
            `咬钩: ${res.hasCaughtFish}`,
            `钩中: ${res.entity}`,
            `垂钓: ${res.isFishing ? '是' : '否'}`,
            // `TITLE: ${res.TITLE}`,
            // `SUBTITLE: ${res.SUBTITLE}`,
            // `ACTIONBAR: ${res.ACTIONBAR}`,
            `游戏: ${JSON.stringify(res.game)}`,
            `价值: ${res.value}`,
        ]
    }
}
const showCustomFishInfo = () => {
    let fishInfos = getCustomFishInfos()
    for (let i = 0; i < fishInfos.display.length; i++)
        fish_panel[i]?.setText(fishInfos.display[i])
    return fishInfos
}
const keyClick = (key, delay = 0) => {
    KeyBind.pressKey(key)
    if (delay > 0)
        Client.waitTick(delay)
    KeyBind.releaseKey(key)
}

Hud.clearDraw2Ds()

if (isToggle()) {
    fish_d2d.setOnInit(JavaWrapper.methodToJava(() => {
        let fishInfos = getCustomFishInfos()
        for (let i = 0; i < fishInfos.display.length; i++) {
            fish_panel.push(fish_d2d.addText(
                fishInfos.display[i],
                fish_d2d_setting.x, fish_d2d_setting.y - Math.round(fish_d2d_setting.scale * 10) * (fishInfos.display.length - i),
                fish_d2d_setting.color, fish_d2d_setting.shadow,
                fish_d2d_setting.scale, fish_d2d_setting.rotation))
        }
    }))
    fish_d2d.register()

    // mcTickListener = JsMacros.on('Tick', JavaWrapper.methodToJava(() => {
    //     Player.openInventory().getSlots(['main', 'hotbar']).forEach(i => {
    //         let slot = Player.openInventory().getSlot(i)
    //         if (dropItemMatch.test(slot.getName().getString())) {
    //             Player.openInventory().dropSlot(i)
    //         }
    //     })
    // }))
    titleListener = JsMacros.on("Title", JavaWrapper.methodToJava(ev => {
        // flog(ev.message.getJson() + '\n')
        titleContainer[ev.type] = ev
        let content = ev.message.getString()

        // if (/[\(（].*[）\)]$/.test(content.trim())) {
        //     // 挂机问答
        //     let matches = /[\(（](?<val>.*)[）\)]$/.exec(content.trim())
        //     let answer = matches?.groups['val'].split(/[\:：]/)[1]?.trim()
        //     if (!matches?.groups['val']?.includes('最佳记录')) {
        //         Chat.log(content)
        //         Chat.say(answer)
        //     }
        // } else if (/[0-9]+\=\?$/.test(content.trim())) {
        //     let matches = /^(?<val>.*)\=\?$/.exec(content.trim())
        //     let val = matches?.groups['val']?.replace(/[x×]/, '*')?.replace('÷', '/')?.replace('＋', '+')
        //     try {
        //         let answer = eval(val)
        //         Chat.say(`${answer}`)
        //     } catch (err) {
        //         Chat.log(err)
        //         // logFile.append(val + '\n')
        //     }
        // } else {
            if (/按下 左Shift 开始/.test(content)) {
                keyClick('key.keyboard.left.shift', 1)
            }
        // }
    }))
}

let danceCache = null
let predictProgress = 0
if (isCustomMode) {
    customfishingfont.default = {
        ...customfishingfont.default,
        ...{
            // 雪玲殿
            b008: {
                "chars": ["\ub015"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar7.png",
                "rate": [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0,
                ],
                "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
            },
            b00a: {
                "chars": ["\ub016"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar9.png",
                "rate": [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                ],
                "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
            },
            b015: {
                "chars": ["\ub015"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar10.png",
                "rate": [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
                    0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                ],
                "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
            },
            b016: {
                "chars": ["\ub016"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar11.png",
                "rate": [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                ],
                "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
            },
            b017: {
                "chars": ["\ub016"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar12.png",
                "rate": [
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                ],
                "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
            },
            b018: {
                "chars": ["\ub016"], "type": "bitmap", "height": 8, "ascent": 8, "file": "customfishing:font/bars/bar13.png",
                "rate": [
                    0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
                ],
                "width-per-section": 4, "pointer-offset": -183, "pointer-width": 5,
            },
        }
    }
}

while (isToggle()) {
    let fishInfos = showCustomFishInfo()

    if (fishInfos.attrs.isFishing) {
        if (fishInfos.attrs.entity) {
            keyClick('key.mouse.right', 2)
            Client.waitTick(20 * 2)
        }
        let game = fishInfos.attrs.game
        if (fishInfos.attrs.hasCaughtFish && game.type == null && isCustomMode) {
            keyClick('key.mouse.right', 1)
            Client.waitTick(10)
        }
        if (game.type == 'TensionGame') {
            if (game.ui) {
                if (/b01[1-3]$/.test(game.ui.progress)) {
                    keyClick('key.keyboard.left.shift', 6 - parseInt(game.ui.progress[game.ui.progress.length - 1]))
                }
            }
        } else if (game.type == 'ClickGame') {
            if (game.ui) {
                keyClick('key.mouse.left')
            }
        } else if (game.type == 'DanceGame') {
            if (game.ui) {
                if (danceCache != game.ui.gray) {
                    keyClick(game.ui.action)
                    danceCache = game.ui.gray
                    Client.waitTick()
                }
            }
        } else if (game.type == 'AccurateClickGame') {
            if (game.ui) {
                if (game.ui.progress == null) {
                    keyClick('key.mouse.right')
                    Client.waitTick(20)
                } else {
                    let chance = game.ui.rate[game.ui.index]
                    chance = game.ui.rate[Math.ceil(game.ui.index + 1 * Math.sign(game.ui.progress - predictProgress))]
                    flog(JSON.stringify(game.ui) + '\n')
                    if (chance == 1) {
                        Client.waitTick(1)
                        keyClick('key.mouse.right')
                        predictProgress = 0
                    } else {
                        predictProgress = game.ui.progress
                    }
                }
            }
        } else if (game.type == 'HoldGame') {
            if (game.ui) {
                if (game.ui.pointerPosition < game.ui.judgementPosition) {
                    keyClick('key.keyboard.left.shift', 2)
                    Client.waitTick(1)
                } else if (game.ui.pointerPosition >= game.ui.judgementPosition
                    && game.ui.pointerPosition <= game.ui.judgementPosition + game.ui.judgementWidth) {
                    keyClick('key.keyboard.left.shift', 1)
                    Client.waitTick(2)
                }
            }
            keyClick('key.mouse.right')
        }
    } else {
        danceCache = null
        // if (fishInfos.attrs.mainHand?.getItemId()?.includes('fishing_rod')) {
        //     Client.waitTick(20)
        //     keyClick('key.mouse.right')
        //     Client.waitTick(20 * 3)
        // }
    }
    Time.sleep(8)
}

// if (mcTickListener)
//     JsMacros.off(mcTickListener)
if (titleListener)
    JsMacros.off(titleListener)
