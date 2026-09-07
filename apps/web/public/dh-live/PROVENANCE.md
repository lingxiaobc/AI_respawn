# Bundled DH_live_mini runtime

Upstream: https://github.com/kleinlee/DH_live

Pinned revision: `4467e97cd97194c2c54762043cf121c6d313db12`.
The files below come from `web_demo/static/` at that revision:

| Local file | Upstream file | Local changes |
| --- | --- | --- |
| DHLiveMini.wasm | DHLiveMini.wasm | None |
| js/DHLiveMini.js | js/DHLiveMini.js | None |
| js/MiniLive2.js | js/MiniLive2.js | Accept HTTP-decoded gzip JSON; remove full-data logging; throw instead of version alert; apply final-pass green suppression after mouth synthesis; fixed neutral portrait; feathered interior mouth mask and aligned local eyelid patches from verified closed-eye frame 65; remove all head/neck compositing and motion |
| js/qt-loader.js | js/MiniMateLoader.js | Retain Qt loader functions; remove upstream page/dialog bootstrap |
| js/pako.min.js | js/pako.min.js | None; pako 2.1.0 MIT AND Zlib notice retained |
| assets/01.mp4 | assets/01.mp4 | None |
| assets/combined_data.json.gz | assets/combined_data.json.gz | None; MatesX marking retained |
| common/bs_texture_halfFace.png | common/bs_texture_halfFace.png | None |
| common/test.wav | common/test.wav | None; upstream demonstration speech |

`frame.html` and `runtime.js` are application integration code. No vendor cloud dialog, credentials or external background video is loaded.

`common/input.wav` is copied from this repository's `fixtures/input/test-utterance.wav`: FSDD 0/1/2_jackson_0 samples, resampled 8→16 kHz and joined with 250 ms silence. Source: https://github.com/Jakobovski/free-spoken-digit-dataset ; license: https://creativecommons.org/licenses/by-sa/4.0/ . Attribution and modifications also appear in `fixtures/README.md`.

## Licensing boundary

The upstream README states “MIT License” and separately says that commercial use of the web part involves avatar authorization (logo removal), linking to https://www.matesx.com/authorized.html . Its statement is retained in `upstream-README.md`. This prototype preserves the supplied avatar and watermark. It does not assert that the sample person's likeness, precompiled WASM, embedded model or all third-party components have unrestricted commercial redistribution rights. No paid authorization or logo removal was performed. Confirm the applicable rights with upstream before a commercial release or avatar replacement.

`manifest.json` records SHA-256 hashes of the bundled executable/assets. Run `npm run avatar:verify` to detect missing or altered resources. This integrity check is not a license review or performance test.
