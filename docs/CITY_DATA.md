# 城市搜索数据

城市选择由旧版 24 个选项扩充至 3,805 个城市、区县及既有国际城市选项。支持中文、拼音、首字母与所属省市搜索；结果最多渲染 40 项，可继续输入缩小范围，支持上下键、回车选择、Esc 收起。可清空或手动输入未收录的海外地点。区县采用完整省市路径保存，避免同名地点混淆；既有城市名不迁移。

## GitHub 来源与许可证

- [modood/Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China)：`dist/pca-code.json`、`dist/HK-MO-TW.json`，WTFPL。覆盖省市区县及港澳台名单。
- [88250/city-geo](https://github.com/88250/city-geo)：`data.json`，MulanPSL-2.0。提供城市县区经纬度，数据来自百度地理编码，适用于本应用的约数距离邮程，不用于精确导航。
- 原许可证副本位于 `docs/licenses/`，来源提交固定在 `scripts/city-sources.json`。更新运行 `python3 scripts/update-cities.py`；仅开发时下载，线上不依赖 GitHub。

生成文件 `server/src/city-data.json` 共 3,798 条；合并原有国际城市与兼容名称后共 3,805 条。当前约 3,417 个选项可解析坐标。区县优先使用本区县坐标，缺失时使用上级城市坐标；港澳区县使用区域约数坐标。其余地点（包括名单中的部分台湾地区）使用默认 24 小时邮程。存量信件的到达时间不重新计算。

后端 `server/src/cities.js` 生成中文／拼音搜索索引，通过 `/paper/meta` 的 `city_options` 提供；原 `cities` 字段继续保留兼容。城市数据随镜像打包，无浏览器定位权限或新的第三方查询。IP 返回英文城市名时会尝试匹配唯一的拼音名称。

## 内置地图选点

名片城市选择器新增「在地图上选地点」，按需加载 Leaflet 和 OpenStreetMap 底图，保留版权标注。支持地图缩放、平移、点选、拖动图钉与城市搜索定位；点选按离线城市中心数据匹配 150 公里以内最近的五个候选，不把城市中心近似匹配描述为行政边界判断。用户确认后只填入城市／区县名称，仍需保存名片；取消不会改变原值。无 GPS 权限请求、不保存点选经纬度、不向地图方传送信件内容；首次打开地图会按视野请求第三方地图瓦片。底图不可用时可继续使用文字搜索。省市区坐标通过公共元数据接口提供，不包含用户定位数据。Leaflet 使用 BSD-2-Clause，地图遵守 OpenStreetMap attribution / tile usage policy。
