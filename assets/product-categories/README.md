# 商品品类实拍图

`sources.json` 记录每张母版的原图页面、作者、图库、许可和下载日期。所有来源均为 Unsplash 或 Pexels 的免费非赞助照片，应用运行时不会请求图库地址。

处理规则：原图短边不低于 1200px，按主体居中的方式裁切为 1:1，转换为 sRGB，轻微校正亮度与色彩，最终输出 512×512 WebP（quality 82，单张不超过 150KB）。

重新制作时运行：

```powershell
python scripts/prepare-product-category-images.py
node scripts/sync-product-category-images.mjs
```

母版位于 `assets/product-categories/master`，五端副本由同步脚本生成，请勿单独修改应用目录中的图片。
