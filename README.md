# jsmacros宏模组脚本合集

- 描述：为minecraft游戏jsmacros模组（以下简称jsm）编写的脚本

## 模组信息

- [JS Macros](https://www.mcmod.cn/class/10531.html)
- [JS Macros CE 社区版](https://modrinth.com/mod/jsmacrosce)
- [JS Macros Reloaded 重制版](https://modrinth.com/mod/jsmacros-reloaded)
- [JS Macros 各版本收录](https://jsmacrosce.github.io/Version-Finder)
## 模组文档

- [JS Macros官方版文档](https://jsmacros.wagyourtail.xyz)
- [JS Macros社区版文档](https://jsmacrosce.com)
- [JS Macros群友版文档](https://jsmacros.mynotes.world)、[快速开始](https://jsmacros.mynotes.world/quick_start/#_6)

- [脚本模板](./脚本模板.js)

## 脚本清单

### 分析类

- JEI/REI聚焦物品信息获取: [EnoughItemsAPI.js](./lib/EnoughItemsAPI.js)
- AE2应用能源2操作终端库存: [AE2Utils.js](./lib/AE2Utils.js)
- RS精致存储操作终端库存: [RSUtils.js](./lib/RSUtils.js)
- 反混淆映射表反射法: [DeobfReflect.js](./lib/DeobfReflect.js)
- Xaero地图自定义渲染: [XaeroMapOverlay.js](./lib/XaeroMapOverlay.js)

### 应用类
- 机动柴油动力油田扫描: [CreateOilScaner.js](./build/CreateOilScaner.js)、[柴油动力油田预览(需用扫描脚本缓存数据)](https://empyrealtear.github.io/jsmacros_scripts/page/柴油动力油田预览.html)
- 沉浸工程矿脉预览: [XareoMap_IEVeins.js](./build/XareoMap_IEVeins.js)、[沉浸工程矿脉预览(网页版)](https://empyrealtear.github.io/jsmacros_scripts/page/沉浸工程矿脉预览.html)
- 失落城市地图雷达: [XareoMap_LostRadar.js](./build/XareoMap_LostRadar.js)
- Baritone路径规划渲染: [BaritoneRender.js](./build/BaritoneRender.js)
- 潮汐自动钓鱼: [TideFishMinigame.js](./build/TideFishMinigame.js)
- 星露谷插件自动钓鱼: [CustomFishing.js](./build/CustomFishing.js)、[ResourceParse_CustomFishing.js](./build/ResourceParse_CustomFishing.js)
