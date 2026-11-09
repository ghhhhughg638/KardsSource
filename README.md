# KARDS Blueprint Studio

专为 KARDS 设计的浏览器蓝图编辑器，视觉布局参考 Unreal Engine 蓝图编辑器。

**GitHub Pages 地址：https://ghhhhughg638.github.io/KardsSource/v1/**（根地址会自动跳转到最新版本 `/v1/`；页面内的「⟳ 刷新」按钮可绕过缓存重新读取最新版本）

- UE 风格的灰色网格、红色 Event、蓝色函数、绿色纯函数、灰色流程、青色 Cast 节点，以及类型对应的引脚颜色。
- 中文显示名与原始英文并列，例如「事件 · 从手牌打出 / Event OnPlayedFromHand」。
- 从本仓库 C++ 头文件生成 608 个原生函数、35 个类、216 个属性和 37 个枚举，保留源码链接。
- 111 个常用 UE 基础节点：Branch、Sequence、DoOnce、Gate、ForLoop、ForEachLoop、Delay、IsValid、GetGameInstance、GetPlayerController、Actor 访问、数学、数组、变量、基本类型转换与可复现随机流。
- 为已知对象类型提供 Cast To，生成属性 Get / Set 节点，为非静态成员函数添加正确类型的 Target 引脚。
- 节点拖拽、执行流与数据连线、相同类型检查、参数及枚举编辑；支持 Alt 单击断线、拖动已选连线的端点重接，以及双击连线插入 Reroute 节点。
- 多选节点可对齐、均匀分布；编辑器和原版蓝图库都支持图内中英文搜索和逐项定位。
- 单一 EventGraph、多个函数及宏、节点注释、自定义节点、卡牌元数据、导航缩略图和画布缩放。
- 多选、复制、删除、撤销与重做，浏览器本地自动保存。
- 导入和导出 `.kardsbp.json`，或将当前图导出为独立 SVG 图像。

这是蓝图的可视化设计和展示工具，不执行游戏逻辑，不导入或生成 Unreal `.uasset` 文件。

## 原版卡牌蓝图库（Codex）

顶部「原版蓝图库」打开独立参考界面，包含解包输入中的全部 **2019 份原版卡牌蓝图、5585 个函数、80736 条顶层源指令**。支持搜索、阵营/类型过滤、函数切换、类默认值和源指令核对，以及复制到工作区继续编辑。参考副本的节点位置、参数和引脚调整按卡牌及显示模式自动保存在浏览器，可恢复原版；源数据变化时旧副本仍可导出。

内置枚举执行分支恢复为函数上的命名出口，比较保留枚举类型；新增 Select / Equal / Not Equal 枚举节点。辅助表达式和高级参数默认收起，按需查看。画布依据烘焙指令重建逻辑布局，不是已剥离的原编辑器坐标。转换与实现署名 **Codex**。

[查看还原范围、证据和更新方法](docs/REFERENCE_LIBRARY.md)。

## 署名

- 编辑器、节点库、工作区、性能与界面优化、更新机制及后续修复：**Claude**（Anthropic）。
- 原版卡牌蓝图库的数据转换与最初的查看器：**Codex**（OpenAI）。2.17.0 起查看器的界面与节点样式由 Claude 统一到编辑器。

提交记录中带有 `Co-Authored-By: Claude`，更新日志每条也标注了作者。

## 蓝图结构（与 Unreal 蓝图一致）

- **EventGraph**：每个蓝图只有一个，不能新建、重命名或删除。`On…` 事件和自定义事件都放在这里。
- **函数**：可以新建自定义函数，也可以重载父类（默认 `UBaseCardObject`）的 `BlueprintImplementableEvent` / `BlueprintNativeEvent` 函数。每个函数带「函数入口」和「返回节点」，支持纯函数。
- **局部变量**：属于某个函数，只能在该函数里用 Get / Set 节点读写；名字不能和该函数的参数重名。
- **宏**：带执行引脚的输入/输出；不能直接或间接引用自身，嵌套最多 8 层。
- **事件分发器**：带参数的委托。用「调用 / 绑定事件 / 解除绑定 / 解除全部绑定」节点操作；自定义事件的 Delegate 引脚可以连到「绑定事件」的 Event 引脚，两边参数签名必须一致。
- **变量**：类型、默认值、分类、说明、实例可编辑、生成时公开；在 EventGraph 和函数里用 Get / Set 节点读写。
- **自定义事件**：带参数，只能放在 EventGraph，可以在 EventGraph 里被调用。
- **命名规则**：资源、函数、宏、变量、自定义事件、参数的名字只能是英文标识符（字母、数字、下划线，不以数字开头，最长 64 位），不支持中文。中文说明请写在「说明」字段里。

导出的 `.kardsbp.json`（版本 2）包含：资源信息（资源路径、生成类、父类及继承链）、卡牌信息、变量、函数、宏、自定义事件、所有图表（节点、连线、带名称的连线列表、视图）、依赖（用到的原生类、原生函数及源码位置、枚举、类型）、统计和导出器信息。旧版本（版本 1）文件不再兼容。

## 工作区（多张卡牌）

左侧「工作区」列出你创建或导入的所有卡牌，每张卡牌是一个独立的蓝图资源，自动保存在浏览器里（每张卡一份存档，互不影响）。

- 点击卡牌切换；右侧按钮可重命名、复制、删除。资源名称在工作区内不能重复。
- 「新建」「导入」都是新增一张卡牌，不会覆盖当前这张。导入支持一次选多个 `.kardsbp.json`，也支持 `.zip`。
- 导出按钮的格式菜单里选「工作区全部 (ZIP)」，会把所有卡牌各打成一个 `.kardsbp.json` 放进一个 ZIP。
- 导出 PNG 时倍率可选 1×–4×，也可以手填 0.5–8；图太大时会自动降低倍率。
- 撤销记录只对当前这张卡牌有效，切换卡牌后会清空。浏览器数据被清除前请先导出。

## 更新提醒

每次打开页面都会检查是否有新版本：部署时流水线会把提交号和版本号写进页面，并发布 `version.json`、`changelog.json`。页面发现发布的版本和自己不同，就弹窗显示更新内容，左边「暂不更新」，右边「立即更新」，右上角可以关闭。「立即更新」会重新下载全部页面文件并刷新，卡牌数据不受影响。更新内容写在 `docs/changelog.json`（最新的在最前面，版本号随功能递增，每条同时写中文和英文）。本地直接打开或用其他托管时没有写入提交号，不会弹窗。

## 使用

拖动左侧节点到画布，或按 `Tab` / 右键搜索节点。从数据引脚拖到空白位置会打开上下文菜单，自动筛选兼容的类型。可以选择「成员函数」「属性」或「类型转换」。创建节点后自动连接目标引脚；从 Cast 的对象输出创建动作函数时，还会在执行输出空闲的情况下接上成功执行流。

例如：拖出 `ObjectReference` 的 `UObject*` 输出 → 选择 `Cast To BaseCardObject` → 从 `As BaseCardObject` 拖出 → 选择 `Get attack` 或 `ResetCardAttributes`。

拖动空白区域平移，滚轮缩放，`F` 适应画布。依次点击输出和输入端口，或将一个端口拖向另一个端口完成连线。新连接会替换同一输入端口的旧连接。

点击节点，在右侧修改参数、位置和注释。`Shift` 点击进行多选，工具栏可对齐和均匀分布，`Ctrl/Cmd+D` 复制，`Delete` 删除，`Ctrl/Cmd+Z` 撤销。`Ctrl/Cmd+F` 搜索当前图，Alt 单击引脚断开全部连线；单击连线后拖动圆形手柄重接，双击连线插入 Reroute。

自动保存仅保存在当前浏览器的 localStorage。使用「导出蓝图」备份文件；导入文件可在其他设备继续编辑。`Ctrl/Cmd+S` 保存本地草稿，`Ctrl/Cmd+Shift+S` 导出文件。节点定义随文件保存，不依赖未来节点库的版本。

## 自定义文件格式

`format` 为 `kards-blueprint`，`version` 为 `2`。扩展名为 `.kardsbp.json`，UTF-8 JSON。以下为含一个布尔节点的最小示例：

```json
{
  "format": "kards-blueprint",
  "version": 2,
  "id": "project-uuid",
  "name": "BP_ExampleCard",
  "asset": { "parentClass": "UBaseCardObject", "packagePath": "/Game/KARDS/Cards", "description": "" },
  "variables": [],
  "dispatchers": [],
  "classDefaults": {},
  "card": {
    "title": "我的卡牌", "faction": "Soviet", "type": "infantry",
    "rarity": "Common", "cost": 3, "attack": 3, "defense": 4,
    "text": "卡牌效果说明"
  },
  "activeGraph": "graph-uuid",
  "graphs": [{
    "id": "graph-uuid",
    "name": "EventGraph",
    "kind": "event",
    "view": { "x": 40, "y": 0, "zoom": 1 },
    "nodes": [{
      "id": "node-uuid", "x": 100, "y": 100,
      "title": "", "comment": "注释", "values": { "Value": true },
      "definition": {
        "id": "studio.Boolean", "name": "Boolean", "class": "Studio",
        "category": "variables", "pure": true,
        "pins": [{"id": "Value", "name": "Value", "type": "bool", "direction": "out"}]
      }
    }],
    "edges": []
  }]
}
```

连线结构为 `{ "id": "edge-uuid", "from": { "node": "输出节点ID", "pin": "端口ID" }, "to": { "node": "输入节点ID", "pin": "端口ID" } }`。每个输入端口最多接受一条连线；执行输出端口最多一条，数据输出可连接多个输入。数值、枚举和容器类型字符串必须相同；对象允许按类继承关系连接到父类型输入，向子类型转换使用 Cast To。项目的可选 `types` 字段保留 `{ "ClassName": { "parent": "ParentClass" } }` 类型层级。`exec` 为执行类型，其余保留 C++ 类型（移除 const/reference 修饰）。事件参数在事件入口上显示为输出。

动作默认带执行输入与输出，纯函数只有数据端口。节点的 `kind` 字段区分 `event`、`function`、`pure`、`flow`、`variable`、`cast`、`conversion`、`getter`、`setter`。可通过「添加节点 → 创建自定义节点」声明独立类型和端口。文件载入时会检查版本、节点与端口标识、连接方向及类型，拒绝无效引用。

## 本地开发与 GitHub Pages

字体和前端资源均随站点保存，不依赖外部 CDN。站点位于 `docs/`，无构建依赖，可直接托管在任意静态服务器。ES modules 和节点库读取需要通过 HTTP 打开：

```sh
python -m http.server 4173 --directory docs
# 打开 http://localhost:4173
```

更新 C++ 头文件后重新生成节点库并提交：

```sh
python tools/generate-node-catalog.py
node --test tools/model.test.mjs
```

`.github/workflows/pages.yml` 在 `main` 的 `docs/` 更新时发布 GitHub Pages。仓库 Settings → Pages 的 Source 使用 **GitHub Actions**。不上传游戏源码到站点产物，仅发布 `docs/`，并发布在站点的 `/v1/` 路径下，根路径只放一个跳转页。

源代码中的 Unreal 模块和兼容声明继续保留在仓库原目录。节点库生成器提供浏览用途的签名解析，不替代 Unreal Header Tool。
