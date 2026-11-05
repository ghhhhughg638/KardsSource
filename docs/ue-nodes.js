// Browser-side definitions of common Unreal Blueprint nodes. These are visual schemas.
const pin = (id, type, direction = "in", name = id) => ({
  id,
  name,
  type,
  direction,
});
const execIn = () => pin("exec-in", "exec", "in", "Exec");
const execOut = (id = "exec-out", name = "Then") =>
  pin(id, "exec", "out", name);
const node = (name, label, pins, options = {}) => ({
  id: "ue." + name,
  name,
  label,
  class: "UE",
  category: "flow",
  kind: "flow",
  pins,
  ...options,
});
const pure = (name, label, pins, options = {}) =>
  node(name, label, pins, {
    category: "math",
    kind: "pure",
    pure: true,
    ...options,
  });
export const ueBuiltins = [
  node(
    "Branch",
    "分支",
    [
      execIn(),
      pin("Condition", "bool"),
      execOut("True", "True"),
      execOut("False", "False"),
    ],
    { id: "studio.Branch" },
  ),
  node(
    "Sequence",
    "序列",
    [execIn(), execOut("Then0", "Then 0"), execOut("Then1", "Then 1")],
    { id: "studio.Sequence" },
  ),
  ...[
    ["Boolean", "布尔变量", "bool"],
    ["Integer", "整数变量", "int32"],
    ["String", "字符串变量", "FString"],
  ].map(([name, label, type]) =>
    pure(name, label, [pin("Value", type, "out")], {
      id: "studio." + name,
      category: "variables",
      kind: "variable",
    }),
  ),
  node("DoOnce", "执行一次", [
    execIn(),
    pin("Reset", "exec"),
    pin("StartClosed", "bool"),
    execOut("Completed", "Completed"),
  ]),
  node("DoN", "执行 N 次", [
    execIn(),
    pin("Reset", "exec"),
    pin("N", "int32"),
    execOut(),
    pin("Counter", "int32", "out"),
  ]),
  node("Gate", "门", [
    pin("Enter", "exec"),
    pin("Open", "exec"),
    pin("Close", "exec"),
    pin("Toggle", "exec"),
    pin("StartClosed", "bool"),
    execOut("Exit", "Exit"),
  ]),
  node("FlipFlop", "交替执行", [
    execIn(),
    execOut("A", "A"),
    execOut("B", "B"),
    pin("IsA", "bool", "out"),
  ]),
  node("ForLoop", "For 循环", [
    execIn(),
    pin("FirstIndex", "int32"),
    pin("LastIndex", "int32"),
    execOut("LoopBody", "Loop Body"),
    pin("Index", "int32", "out"),
    execOut("Completed", "Completed"),
  ]),
  node("ForLoopWithBreak", "可中断 For 循环", [
    execIn(),
    pin("FirstIndex", "int32"),
    pin("LastIndex", "int32"),
    pin("Break", "exec"),
    execOut("LoopBody", "Loop Body"),
    pin("Index", "int32", "out"),
    execOut("Completed", "Completed"),
  ]),
  node("WhileLoop", "While 循环", [
    execIn(),
    pin("Condition", "bool"),
    execOut("LoopBody", "Loop Body"),
    execOut("Completed", "Completed"),
  ]),
  node(
    "Delay",
    "延迟",
    [execIn(), pin("Duration", "float"), execOut("Completed", "Completed")],
    { kind: "function", category: "utilities" },
  ),
  node(
    "RetriggerableDelay",
    "可重触发延迟",
    [execIn(), pin("Duration", "float"), execOut("Completed", "Completed")],
    { kind: "function", category: "utilities" },
  ),
  // Like Unreal: one "Switch on Enum" node; its enum is picked on the node (or set by wiring an
  // enum into Selection) and the execution outputs follow the enumerators.
  node(
    "SwitchOnEnum",
    "按枚举切换",
    [execIn(), pin("Selection", "$E")],
    { english: "Switch on Enum", switchEnum: true },
  ),
  node("SwitchOnInt", "按整数切换", [
    execIn(),
    pin("Selection", "int32"),
    execOut("0", "0"),
    execOut("1", "1"),
    execOut("2", "2"),
    execOut("Default", "Default"),
  ]),
  node(
    "PrintString",
    "打印字符串",
    [
      execIn(),
      pin("InString", "FString"),
      pin("PrintToScreen", "bool"),
      pin("Duration", "float"),
      execOut(),
    ],
    { kind: "function", category: "utilities" },
  ),
  pure(
    "IsValid",
    "是否有效",
    [pin("Object", "UObject*"), pin("return", "bool", "out", "Return Value")],
    { category: "queries" },
  ),
  node("IsValidExec", "是否有效（执行）", [
    execIn(),
    pin("Object", "UObject*"),
    execOut("IsValid", "Is Valid"),
    execOut("IsNotValid", "Is Not Valid"),
  ]),
  pure("Self", "自身引用", [pin("Self", "UBaseCardObject*", "out")], {
    category: "variables",
    kind: "variable",
  }),
  pure("ObjectReference", "对象引用", [pin("Value", "UObject*", "out")], {
    category: "variables",
    kind: "variable",
  }),
  pure("Float", "浮点变量", [pin("Value", "float", "out")], {
    category: "variables",
    kind: "variable",
  }),
  pure("Name", "名称变量", [pin("Value", "FName", "out")], {
    category: "variables",
    kind: "variable",
  }),
  pure("Text", "文本变量", [pin("Value", "FText", "out")], {
    category: "variables",
    kind: "variable",
  }),
  pure(
    "GetDisplayName",
    "获取显示名称",
    [
      pin("Object", "UObject*"),
      pin("return", "FString", "out", "Return Value"),
    ],
    { category: "queries" },
  ),
  pure(
    "EqualObject",
    "对象相等",
    [
      pin("A", "UObject*"),
      pin("B", "UObject*"),
      pin("return", "bool", "out", "Return Value"),
    ],
    { category: "math" },
  ),
  pure("MakeVector", "构造向量", [
    pin("X", "float"),
    pin("Y", "float"),
    pin("Z", "float"),
    pin("return", "FVector", "out", "Return Value"),
  ]),
  pure("BreakVector", "拆分向量", [
    pin("Vector", "FVector"),
    pin("X", "float", "out"),
    pin("Y", "float", "out"),
    pin("Z", "float", "out"),
  ]),
  ...[
    ["Add", "加"],
    ["Subtract", "减"],
    ["Multiply", "乘"],
    ["Divide", "除"],
    ["Min", "最小值"],
    ["Max", "最大值"],
  ].flatMap(([op, label]) =>
    ["int32", "float"].map((type) =>
      pure(
        `${op}_${type}`,
        `${label}（${type === "int32" ? "整数" : "浮点"}）`,
        [
          pin("A", type),
          pin("B", type),
          pin("return", type, "out", "Return Value"),
        ],
      ),
    ),
  ),
  ...[
    ["Greater", "大于"],
    ["Less", "小于"],
    ["Equal", "等于"],
    ["NotEqual", "不等于"],
    ["GreaterEqual", "大于等于"],
    ["LessEqual", "小于等于"],
  ].flatMap(([op, label]) =>
    ["int32", "float"].map((type) =>
      pure(
        `${op}_${type}`,
        `${label}（${type === "int32" ? "整数" : "浮点"}）`,
        [
          pin("A", type),
          pin("B", type),
          pin("return", "bool", "out", "Return Value"),
        ],
      ),
    ),
  ),
  ...["int32", "float"].map((type) =>
    pure("Clamp_" + type, "限制范围", [
      pin("Value", type),
      pin("Min", type),
      pin("Max", type),
      pin("return", type, "out", "Return Value"),
    ]),
  ),
  ...[
    ["AND", "与"],
    ["OR", "或"],
    ["NAND", "与非"],
    ["NOR", "或非"],
    ["XOR", "异或"],
  ].map(([name, label]) =>
    pure(name, label, [
      pin("A", "bool"),
      pin("B", "bool"),
      pin("return", "bool", "out", "Return Value"),
    ]),
  ),
  pure("NOT", "非", [
    pin("A", "bool"),
    pin("return", "bool", "out", "Return Value"),
  ]),
  ...["int32", "float", "FString", "UBaseCardObject*"].map((type) =>
    pure(
      "Select_" + type,
      "选择",
      [
        pin("Index", "bool"),
        pin("A", type),
        pin("B", type),
        pin("return", type, "out", "Return Value"),
      ],
      { category: "flow" },
    ),
  ),
  pure(
    "AppendString",
    "追加字符串",
    [
      pin("A", "FString"),
      pin("B", "FString"),
      pin("return", "FString", "out", "Return Value"),
    ],
    { category: "utilities" },
  ),
  ...[
    ["int32", "float"],
    ["float", "int32"],
    ["int32", "FString"],
    ["float", "FString"],
    ["bool", "FString"],
    ["FName", "FString"],
    ["FString", "FName"],
    ["FString", "FText"],
    ["FText", "FString"],
  ].map(([from, to]) =>
    pure(
      "Convert_" + from + "_To_" + to,
      `${from} 转 ${to}`,
      [pin("In", from), pin("return", to, "out", "Return Value")],
      { category: "conversion", kind: "conversion" },
    ),
  ),
  // Array library: one set of nodes for any element type ("$T" resolves when something is wired).
  ...(() => {
    const T = "$T",
      array = `TArray<${T}>`,
      wild = (name, label, english, pins, options = {}) => {
        const def = node(name, label, pins, { english, category: "arrays", ...options });
        return { ...def, wild: pins.map((p) => ({ ...p })) };
      },
      wildPure = (name, label, english, pins) =>
        wild(name, label, english, pins, { kind: "pure", pure: true });
    return [
      wild(
        "ForEachLoop",
        "遍历数组",
        "For Each Loop",
        [execIn(), pin("Array", array), execOut("LoopBody", "Loop Body"), pin("ArrayElement", T, "out", "Array Element"), pin("ArrayIndex", "int32", "out", "Array Index"), execOut("Completed", "Completed")],
      ),
      wild(
        "ForEachLoopWithBreak",
        "可中断遍历数组",
        "For Each Loop with Break",
        [execIn(), pin("Array", array), pin("Break", "exec"), execOut("LoopBody", "Loop Body"), pin("ArrayElement", T, "out", "Array Element"), pin("ArrayIndex", "int32", "out", "Array Index"), execOut("Completed", "Completed")],
      ),
      wildPure("ArrayLength", "数组长度", "Length", [pin("Array", array), pin("return", "int32", "out", "Length")]),
      wildPure("GetArrayItem", "获取数组元素", "Get", [pin("Array", array), pin("Index", "int32"), pin("Item", T, "out")]),
      wildPure("MakeArray", "构造数组", "Make Array", [pin("Item0", T, "in", "0"), pin("Item1", T, "in", "1"), pin("Array", array, "out")]),
      wildPure("ArrayContains", "数组包含元素", "Contains Item", [pin("Array", array), pin("ItemToFind", T, "in", "Item To Find"), pin("return", "bool", "out", "Return Value")]),
      wildPure("ArrayFind", "查找元素下标", "Find Item", [pin("Array", array), pin("ItemToFind", T, "in", "Item To Find"), pin("return", "int32", "out", "Index")]),
      wildPure("ArrayLastIndex", "最后一个下标", "Last Index", [pin("Array", array), pin("return", "int32", "out", "Return Value")]),
      wildPure("ArrayIsValidIndex", "下标是否有效", "Is Valid Index", [pin("Array", array), pin("IndexToTest", "int32", "in", "Index To Test"), pin("return", "bool", "out", "Return Value")]),
      wild("AddUniqueArrayItem", "添加不重复元素", "Add Unique", [execIn(), pin("Array", array), pin("NewItem", T, "in", "New Item"), execOut(), pin("Index", "int32", "out")], { kind: "function" }),
      wild("RemoveArrayItem", "移除数组元素", "Remove Item", [execIn(), pin("Array", array), pin("Item", T), execOut(), pin("return", "bool", "out", "Return Value")], { kind: "function" }),
      wild("ClearArray", "清空数组", "Clear", [execIn(), pin("Array", array), execOut()], { kind: "function" }),
      wild("AddArrayItem", "添加数组元素", "Add", [execIn(), pin("Array", array), pin("NewItem", T, "in", "New Item"), execOut(), pin("Index", "int32", "out")], { kind: "function" }),
      wildPure("ArrayRandomItem", "随机元素", "Random Item", [pin("Array", array), pin("Item", T, "out")]),
      wildPure("ArrayIsEmpty", "数组为空", "Is Empty", [pin("Array", array), pin("return", "bool", "out", "Return Value")]),
      wildPure("ArrayIsNotEmpty", "数组不为空", "Is Not Empty", [pin("Array", array), pin("return", "bool", "out", "Return Value")]),
      wildPure("ArrayFirstItem", "第一个元素", "First Item", [pin("Array", array), pin("Item", T, "out")]),
      wildPure("ArrayLastItem", "最后一个元素", "Last Item", [pin("Array", array), pin("Item", T, "out")]),
      wild("InsertArrayItem", "插入数组元素", "Insert", [execIn(), pin("Array", array), pin("NewItem", T, "in", "New Item"), pin("Index", "int32"), execOut()], { kind: "function" }),
      wild("RemoveArrayIndex", "按下标移除", "Remove Index", [execIn(), pin("Array", array), pin("IndexToRemove", "int32", "in", "Index To Remove"), execOut()], { kind: "function" }),
      wild("SetArrayElem", "设置数组元素", "Set Array Elem", [execIn(), pin("Array", array), pin("Index", "int32"), pin("Item", T), pin("SizeToFit", "bool", "in", "Size to Fit"), execOut()], { kind: "function" }),
      wild("AppendArray", "追加数组", "Append Array", [execIn(), pin("TargetArray", array, "in", "Target Array"), pin("SourceArray", array, "in", "Source Array"), execOut()], { kind: "function" }),
      wild("ReverseArray", "反转数组", "Reverse", [execIn(), pin("Array", array), execOut()], { kind: "function" }),
      wild("ShuffleArray", "打乱数组", "Shuffle", [execIn(), pin("Array", array), execOut()], { kind: "function" }),
      wild("SwapArrayElements", "交换两个元素", "Swap", [execIn(), pin("Array", array), pin("FirstIndex", "int32", "in", "First Index"), pin("SecondIndex", "int32", "in", "Second Index"), execOut()], { kind: "function" }),
      wild("ResizeArray", "调整数组长度", "Resize", [execIn(), pin("Array", array), pin("Size", "int32"), execOut()], { kind: "function" }),
    ];
  })(),
];
// ---------------------------------------------------------------- everyday Unreal nodes
// Math, comparison, string, conversion, random, vector and flow nodes that Blueprint users reach for
// all the time. `english` is the name Unreal shows for the node.
ueBuiltins.push(
  ...(() => {
    const NUM = [
        ["int32", "整数", "Integer"],
        ["float", "浮点", "Float"],
      ],
      T = "$T",
      out = (type, name = "Return Value") => pin("return", type, "out", name),
      fn = (name, label, english, pins, options = {}) =>
        pure(name, label, pins, { english, category: "math", ...options }),
      act = (name, label, english, pins, options = {}) =>
        node(name, label, pins, { english, category: "flow", ...options }),
      wildFn = (name, label, english, pins, options = {}) => ({
        ...fn(name, label, english, pins, options),
        wild: pins.map((p) => ({ ...p })),
      }),
      list = [];
    // ---- math (integer and float)
    for (const [type, zh, en] of NUM) {
      const both = (name, label, english, pins, options) =>
        list.push(fn(`${name}_${type}`, `${label}（${zh}）`, `${english} (${en})`, pins, options));
      both("Abs", "绝对值", "Absolute", [pin("A", type), out(type)]);
      both("Sign", "符号", "Sign", [pin("A", type), out(type)]);
      both("Modulo", "取余", "Modulo", [pin("A", type), pin("B", type), out(type)]);
      both("InRange", "是否在范围内", "In Range", [pin("Value", type), pin("Min", type), pin("Max", type), pin("InclusiveMin", "bool"), pin("InclusiveMax", "bool"), out("bool")]);
    }
    list.push(
      fn("Power", "幂", "Power", [pin("Base", "float"), pin("Exp", "float"), out("float")]),
      fn("Sqrt", "平方根", "Sqrt", [pin("A", "float"), out("float")]),
      fn("Square", "平方", "Square", [pin("A", "float"), out("float")]),
      fn("Round", "四舍五入", "Round", [pin("A", "float"), out("int32")]),
      fn("Floor", "向下取整", "Floor", [pin("A", "float"), out("int32")]),
      fn("Ceil", "向上取整", "Ceil", [pin("A", "float"), out("int32")]),
      fn("Truncate", "截断取整", "Truncate", [pin("A", "float"), out("int32")]),
      fn("Fraction", "小数部分", "Fraction", [pin("A", "float"), out("float")]),
      fn("Sin", "正弦", "Sin (Radians)", [pin("A", "float"), out("float")]),
      fn("Cos", "余弦", "Cos (Radians)", [pin("A", "float"), out("float")]),
      fn("Tan", "正切", "Tan (Radians)", [pin("A", "float"), out("float")]),
      fn("Lerp", "线性插值", "Lerp", [pin("A", "float"), pin("B", "float"), pin("Alpha", "float"), out("float")]),
      fn("MapRangeClamped", "区间映射（限制）", "Map Range Clamped", [pin("Value", "float"), pin("InRangeA", "float", "in", "In Range A"), pin("InRangeB", "float", "in", "In Range B"), pin("OutRangeA", "float", "in", "Out Range A"), pin("OutRangeB", "float", "in", "Out Range B"), out("float")]),
      fn("NearlyEqual", "近似相等", "Nearly Equal", [pin("A", "float"), pin("B", "float"), pin("ErrorTolerance", "float", "in", "Error Tolerance"), out("bool")]),
      // random
      fn("RandomInteger", "随机整数", "Random Integer", [pin("Max", "int32"), out("int32")], { category: "random" }),
      fn("RandomIntegerInRange", "范围内随机整数", "Random Integer in Range", [pin("Min", "int32"), pin("Max", "int32"), out("int32")], { category: "random" }),
      fn("RandomFloat", "随机浮点", "Random Float", [out("float")], { category: "random" }),
      fn("RandomFloatInRange", "范围内随机浮点", "Random Float in Range", [pin("Min", "float"), pin("Max", "float"), out("float")], { category: "random" }),
      fn("RandomBool", "随机布尔", "Random Bool", [out("bool")], { category: "random" }),
      fn("RandomBoolWithWeight", "按概率随机布尔", "Random Bool with Weight", [pin("Weight", "float"), out("bool")], { category: "random" }),
      // Seeded randomness: the stream is a value that callers pass through and update.
      fn("MakeRandomStream", "构造随机流", "Make Random Stream", [pin("InitialSeed", "int32", "in", "Initial Seed"), out("FRandomStream")], { category: "random" }),
      pure("BreakRandomStream", "拆分随机流", [pin("InRandomStream", "FRandomStream", "in", "In Random Stream"), pin("InitialSeed", "int32", "out", "Initial Seed"), pin("Seed", "int32", "out")], { english: "Break Random Stream", category: "random" }),
      fn("RandomIntegerFromStream", "从随机流取随机整数", "Random Integer from Stream", [pin("Stream", "FRandomStream"), pin("Max", "int32"), out("int32")], { category: "random" }),
      fn("RandomIntegerInRangeFromStream", "从随机流取范围内随机整数", "Random Integer in Range from Stream", [pin("Stream", "FRandomStream"), pin("Min", "int32"), pin("Max", "int32"), out("int32")], { category: "random" }),
      fn("RandomFloatFromStream", "从随机流取随机浮点", "Random Float from Stream", [pin("Stream", "FRandomStream"), out("float")], { category: "random" }),
      fn("RandomFloatInRangeFromStream", "从随机流取范围内随机浮点", "Random Float in Range from Stream", [pin("Stream", "FRandomStream"), pin("Min", "float"), pin("Max", "float"), out("float")], { category: "random" }),
      fn("RandomBoolFromStream", "从随机流取随机布尔", "Random Bool from Stream", [pin("Stream", "FRandomStream"), out("bool")], { category: "random" }),
      fn("RandomBoolWithWeightFromStream", "从随机流按概率取随机布尔", "Random Bool with Weight from Stream", [pin("Stream", "FRandomStream"), pin("Weight", "float"), out("bool")], { category: "random" }),
      fn("RandomUnitVectorFromStream", "从随机流取随机单位向量", "Random Unit Vector from Stream", [pin("Stream", "FRandomStream"), out("FVector")], { category: "random" }),
      fn("RandomPointInBoundingBoxFromStream", "从随机流取包围盒内随机点", "Random Point in Bounding Box from Stream", [pin("Stream", "FRandomStream"), pin("Origin", "FVector"), pin("BoxExtent", "FVector", "in", "Box Extent"), out("FVector")], { category: "random" }),
      // vectors and rotators
      fn("Add_FVector", "向量加", "Add (Vector)", [pin("A", "FVector"), pin("B", "FVector"), out("FVector")]),
      fn("Subtract_FVector", "向量减", "Subtract (Vector)", [pin("A", "FVector"), pin("B", "FVector"), out("FVector")]),
      fn("Multiply_FVector_float", "向量乘浮点", "Multiply (Vector * Float)", [pin("A", "FVector"), pin("B", "float"), out("FVector")]),
      fn("VectorLength", "向量长度", "Vector Length", [pin("A", "FVector"), out("float")]),
      fn("VectorNormalize", "向量归一化", "Normalize", [pin("A", "FVector"), out("FVector")]),
      fn("VectorDistance", "向量距离", "Distance", [pin("V1", "FVector"), pin("V2", "FVector"), out("float")]),
      fn("VectorDot", "向量点乘", "Dot Product", [pin("A", "FVector"), pin("B", "FVector"), out("float")]),
      fn("VectorCross", "向量叉乘", "Cross Product", [pin("A", "FVector"), pin("B", "FVector"), out("FVector")]),
      fn("MakeRotator", "构造旋转", "Make Rotator", [pin("Roll", "float"), pin("Pitch", "float"), pin("Yaw", "float"), out("FRotator")]),
      pure("BreakRotator", "拆分旋转", [pin("Rotator", "FRotator"), pin("Roll", "float", "out"), pin("Pitch", "float", "out"), pin("Yaw", "float", "out")], { english: "Break Rotator", category: "math" }),
    );
    // ---- comparison of any type (enums, names, strings, booleans, objects: the type comes from the wire)
    list.push(
      wildFn("EqualAny", "等于（任意类型）", "Equal (==)", [pin("A", T), pin("B", T), out("bool")]),
      wildFn("NotEqualAny", "不等于（任意类型）", "Not Equal (!=)", [pin("A", T), pin("B", T), out("bool")]),
      wildFn("SelectIndex", "选择（整数索引）", "Select (Integer)", [pin("Index", "int32"), pin("Option0", T, "in", "[0]"), pin("Option1", T, "in", "[1]"), out(T)], { category: "flow" }),
      wildFn("SelectAny", "选择（任意类型）", "Select", [pin("PickA", "bool", "in", "Pick A"), pin("A", T), pin("B", T), out(T)], { category: "flow" }),
    );
    // ---- strings
    const str = (name, label, english, pins) => list.push(fn(name, label, english, pins, { category: "strings" }));
    str("StringLength", "字符串长度", "Len", [pin("SourceString", "FString", "in", "Source String"), out("int32")]);
    str("StringToUpper", "转大写", "To Upper", [pin("SourceString", "FString", "in", "Source String"), out("FString")]);
    str("StringToLower", "转小写", "To Lower", [pin("SourceString", "FString", "in", "Source String"), out("FString")]);
    str("StringContains", "字符串包含", "Contains", [pin("SearchIn", "FString", "in", "Search In"), pin("Substring", "FString"), pin("UseCase", "bool", "in", "Use Case"), out("bool")]);
    str("StringStartsWith", "字符串开头是", "Starts With", [pin("SourceString", "FString", "in", "Source String"), pin("InPrefix", "FString", "in", "In Prefix"), out("bool")]);
    str("StringEndsWith", "字符串结尾是", "Ends With", [pin("SourceString", "FString", "in", "Source String"), pin("InSuffix", "FString", "in", "In Suffix"), out("bool")]);
    str("StringReplace", "替换字符串", "Replace", [pin("SourceString", "FString", "in", "Source String"), pin("From", "FString"), pin("To", "FString"), out("FString")]);
    str("StringTrim", "去掉首尾空白", "Trim", [pin("SourceString", "FString", "in", "Source String"), out("FString")]);
    str("StringLeft", "取左边", "Left", [pin("SourceString", "FString", "in", "Source String"), pin("Count", "int32"), out("FString")]);
    str("StringRight", "取右边", "Right", [pin("SourceString", "FString", "in", "Source String"), pin("Count", "int32"), out("FString")]);
    str("StringMid", "取中间", "Mid", [pin("SourceString", "FString", "in", "Source String"), pin("Start", "int32"), pin("Count", "int32"), out("FString")]);
    str("StringIsEmpty", "字符串为空", "Is Empty (String)", [pin("InString", "FString", "in", "In String"), out("bool")]);
    str("StringEqualIgnoreCase", "字符串相等（忽略大小写）", "Equal (Case Insensitive)", [pin("A", "FString"), pin("B", "FString"), out("bool")]);
    str("StringFind", "查找子串", "Find Substring", [pin("SearchIn", "FString", "in", "Search In"), pin("Substring", "FString"), pin("UseCase", "bool", "in", "Use Case"), out("int32", "Index")]);
    str("StringSplit", "拆分字符串", "Parse Into Array", [pin("SourceString", "FString", "in", "Source String"), pin("Delimiter", "FString"), out("TArray<FString>", "Array")]);
    str("StringJoin", "合并字符串数组", "Join String Array", [pin("SourceArray", "TArray<FString>", "in", "Source Array"), pin("Separator", "FString"), out("FString")]);
    // ---- conversions
    list.push(
      ...[
        ["FString", "int32", "字符串转整数", "To Integer (String)"],
        ["FString", "float", "字符串转浮点", "To Float (String)"],
        ["bool", "int32", "布尔转整数", "To Integer (Boolean)"],
        ["int32", "FText", "整数转文本", "To Text (Integer)"],
        ["float", "FText", "浮点转文本", "To Text (Float)"],
        ["bool", "FText", "布尔转文本", "To Text (Boolean)"],
        ["FName", "FText", "名称转文本", "To Text (Name)"],
        ["FVector", "FString", "向量转字符串", "To String (Vector)"],
      ].map(([from, to, label, english]) =>
        pure(`Convert_${from}_To_${to}`, label, [pin("In", from), out(to)], { english, category: "conversion", kind: "conversion" }),
      ),
    );
    // ---- literals and time
    for (const [type, zh, en] of [
      ["int32", "整数", "Integer"],
      ["float", "浮点", "Float"],
      ["FString", "字符串", "String"],
      ["bool", "布尔", "Boolean"],
      ["FName", "名称", "Name"],
      ["FText", "文本", "Text"],
    ])
      list.push(fn(`MakeLiteral_${type}`, `字面值（${zh}）`, `Make Literal ${en}`, [pin("Value", type), out(type)], { category: "utilities" }));
    list.push(
      fn("GetGameTimeInSeconds", "游戏时间（秒）", "Get Game Time in Seconds", [out("float")], { category: "utilities" }),
      fn("GetRealTimeSeconds", "真实时间（秒）", "Get Real Time Seconds", [out("float")], { category: "utilities" }),
    );
    // ---- flow
    list.push(
      act("Sequence3", "序列（3 路）", "Sequence (3)", [execIn(), execOut("Then0", "Then 0"), execOut("Then1", "Then 1"), execOut("Then2", "Then 2")]),
      act("Sequence4", "序列（4 路）", "Sequence (4)", [execIn(), execOut("Then0", "Then 0"), execOut("Then1", "Then 1"), execOut("Then2", "Then 2"), execOut("Then3", "Then 3")]),
      act("MultiGate", "多路门", "MultiGate", [execIn(), pin("Reset", "exec"), pin("IsRandom", "bool", "in", "Is Random"), pin("Loop", "bool"), execOut("Out0", "Out 0"), execOut("Out1", "Out 1"), execOut("Out2", "Out 2")]),
      act("SwitchOnString", "按字符串分支", "Switch on String", [execIn(), pin("Selection", "FString"), execOut("Default", "Default"), pin("Case0", "FString", "in", "Case 0"), execOut("Out0", "Out 0"), pin("Case1", "FString", "in", "Case 1"), execOut("Out1", "Out 1"), pin("Case2", "FString", "in", "Case 2"), execOut("Out2", "Out 2")]),
      act("SwitchOnName", "按名称分支", "Switch on Name", [execIn(), pin("Selection", "FName"), execOut("Default", "Default"), pin("Case0", "FName", "in", "Case 0"), execOut("Out0", "Out 0"), pin("Case1", "FName", "in", "Case 1"), execOut("Out1", "Out 1"), pin("Case2", "FName", "in", "Case 2"), execOut("Out2", "Out 2")]),
    );
    return list;
  })(),
);

// Give every remaining built-in the English name Unreal shows (Add (Integer), To String (Float), ...).
{
  const TYPE_NAME = { int32: "Integer", float: "Float", FString: "String", bool: "Boolean", FName: "Name", FText: "Text", FVector: "Vector", "UBaseCardObject*": "BaseCardObject" },
    words = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1 $2"),
    SPECIAL = { EqualObject: "Equal (Object)", AND: "AND Boolean", OR: "OR Boolean", XOR: "XOR Boolean", NOT: "NOT Boolean", IsValidExec: "Is Valid", MakeVector: "Make Vector", BreakVector: "Break Vector", ForLoopWithBreak: "For Loop with Break", SwitchOnInt: "Switch on Int", SetActorLocation: "Set Actor Location", GetActorLocation: "Get Actor Location", PrintString: "Print String", AppendString: "Append" };
  for (const d of ueBuiltins) {
    if (d.english || d.class !== "UE" || d.kind === "variable" || d.event) continue;
    const convert = /^Convert_(.+)_To_(.+)$/.exec(d.name);
    if (convert) {
      d.english = `To ${TYPE_NAME[convert[2]] || convert[2]} (${TYPE_NAME[convert[1]] || convert[1]})`;
      continue;
    }
    const typed = /^(.+)_(int32|float|FString|bool|FName|FText|FVector|UBaseCardObject\*)$/.exec(d.name);
    if (typed) d.english = `${words(typed[1])} (${TYPE_NAME[typed[2]]})`;
    else if (SPECIAL[d.name]) d.english = SPECIAL[d.name];
    else if (/[a-z][A-Z]/.test(d.name)) d.english = words(d.name);
  }
}
// Engine accessors make object-to-KARDS casting workflows possible from familiar UE nodes.
ueBuiltins.push(
  node("ReceiveBeginPlay", "开始游戏", [execOut()], {
    category: "events",
    kind: "event",
    event: true,
    class: "AActor",
  }),
  node(
    "ReceiveTick",
    "每帧更新",
    [execOut(), pin("DeltaSeconds", "float", "out")],
    { category: "events", kind: "event", event: true, class: "AActor" },
  ),
  pure(
    "GetGameInstance",
    "获取游戏实例",
    [pin("return", "UGameInstance*", "out", "Return Value")],
    { category: "queries" },
  ),
  pure(
    "GetGameMode",
    "获取游戏模式",
    [pin("return", "AGameModeBase*", "out", "Return Value")],
    { category: "queries" },
  ),
  pure(
    "GetGameState",
    "获取游戏状态",
    [pin("return", "AGameStateBase*", "out", "Return Value")],
    { category: "queries" },
  ),
  pure(
    "GetPlayerController",
    "获取玩家控制器",
    [
      pin("PlayerIndex", "int32"),
      pin("return", "APlayerController*", "out", "Return Value"),
    ],
    { category: "queries" },
  ),
  pure(
    "GetPlayerPawn",
    "获取玩家 Pawn",
    [
      pin("PlayerIndex", "int32"),
      pin("return", "APawn*", "out", "Return Value"),
    ],
    { category: "queries" },
  ),
  pure(
    "GetWorldDeltaSeconds",
    "获取帧间隔",
    [pin("return", "float", "out", "Return Value")],
    { category: "queries" },
  ),
  pure(
    "GetOwner",
    "获取拥有者",
    [
      pin("target", "AActor*", "in", "Target"),
      pin("return", "AActor*", "out", "Return Value"),
    ],
    { class: "AActor", category: "queries" },
  ),
  pure(
    "GetActorLocation",
    "获取 Actor 位置",
    [
      pin("target", "AActor*", "in", "Target"),
      pin("return", "FVector", "out", "Return Value"),
    ],
    { class: "AActor", category: "queries" },
  ),
  node(
    "SetActorLocation",
    "设置 Actor 位置",
    [
      execIn(),
      pin("target", "AActor*", "in", "Target"),
      pin("NewLocation", "FVector"),
      pin("Sweep", "bool"),
      pin("Teleport", "bool"),
      execOut(),
      pin("return", "bool", "out", "Return Value"),
    ],
    { class: "AActor", category: "utilities", kind: "function" },
  ),
  pure(
    "GetClass",
    "获取类型",
    [
      pin("Object", "UObject*"),
      pin("return", "UClass*", "out", "Return Value"),
    ],
    { category: "queries" },
  ),
);
export const engineClasses = {
  UObject: { parent: null },
  UClass: { parent: "UObject" },
  AGameModeBase: { parent: "AActor" },
  AGameStateBase: { parent: "AActor" },
  UDataAsset: { parent: "UObject" },
  UPrimaryDataAsset: { parent: "UDataAsset" },
  AActor: { parent: "UObject" },
  AController: { parent: "AActor" },
  APlayerController: { parent: "AController" },
  APawn: { parent: "AActor" },
  ACharacter: { parent: "APawn" },
  UActorComponent: { parent: "UObject" },
  USceneComponent: { parent: "UActorComponent" },
  UWidget: { parent: "UObject" },
  UUserWidget: { parent: "UWidget" },
  UGameInstance: { parent: "UObject" },
  USubsystem: { parent: "UObject" },
  UGameInstanceSubsystem: { parent: "USubsystem" },
  UEngineSubsystem: { parent: "USubsystem" },
  UBlueprintFunctionLibrary: { parent: "UObject" },
  // Blueprint classes shipped with the game (not in the C++ headers). They are what a card's
  // cardFunction / the local player controller really are, so "Cast To" them is needed to reach
  // anything the Blueprint adds on top of the C++ parent.
  BP_CardFunctions: { parent: "ACardFunctionsStub", blueprint: true },
  BP_PlayerController: { parent: "AKardsPlayerController", blueprint: true },
  BP_Logic: { parent: "AkardsGameMode", blueprint: true },
  BP_GameState_Battle: { parent: "AkardsGameState", blueprint: true },
  BP_KardsGameInstance: { parent: "UKardsGameInstance2", blueprint: true },
};
export function typeNodes(classes, properties) {
  const casts = Object.keys(classes)
    .filter((c) => c !== "UObject")
    .map((cls) =>
      node(
        "Cast To " + cls.replace(/^[UA](?=[A-Z])/, " ").trim(),
        "转换为 " + cls,
        [
          execIn(),
          pin("Object", "UObject*"),
          execOut("Success", "Success"),
          execOut("Failed", "Cast Failed"),
          pin(
            "As" + cls,
            cls + "*",
            "out",
            "As " + cls.replace(/^[UA](?=[A-Z])/, ""),
          ),
        ],
        {
          id: "ue.cast." + cls,
          category: "conversion",
          kind: "cast",
          class: cls,
          targetClass: cls,
        },
      ),
    );
  const accessors = properties.flatMap((p) => {
    const target = () => pin("target", p.class + "*", "in", "Target");
    const base = {
      class: p.class,
      source: p.source,
      property: p.name,
      category: "properties",
    };
    const getter = pure(
      "Get " + p.name,
      "获取 " + p.name,
      [target(), pin("value", p.type, "out", p.name)],
      {
        ...base,
        id: p.class + ".get." + p.name,
        kind: "getter",
        signature: `${p.class}::${p.name} : ${p.type}`,
      },
    );
    const setter = node(
      "Set " + p.name,
      "设置 " + p.name,
      [
        execIn(),
        target(),
        pin("value", p.type, "in", p.name),
        execOut(),
        pin("result", p.type, "out", "Output"),
      ],
      {
        ...base,
        id: p.class + ".set." + p.name,
        kind: "setter",
        signature: `${p.class}::${p.name} = ${p.type}`,
      },
    );
    return p.writable ? [getter, setter] : [getter];
  });
  return [...casts, ...accessors];
}
