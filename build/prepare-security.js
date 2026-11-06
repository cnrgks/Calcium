'use strict';
exports.default=async()=>{const prepare=require.resolve('../tools/prepare-security');delete require.cache[prepare];require(prepare);const installer=require.resolve('../tools/prepare-installer.cjs');delete require.cache[installer];require(installer);};
