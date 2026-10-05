import { FFMessageType } from "./const.js";
import {
  ERROR_UNKNOWN_MESSAGE_TYPE,
  ERROR_NOT_LOADED,
  ERROR_IMPORT_FAILURE,
} from "./errors.js";

let ffmpeg;

const load = async ({
  coreURL: _coreURL,
  wasmURL: _wasmURL,
  workerURL: _workerURL,
}) => {
  try {
    const coreURL = _coreURL;
    const wasmURL = _wasmURL || coreURL.replace(/\.js$/g, ".wasm");
    const workerURL = _workerURL || coreURL.replace(/\.js$/g, ".worker.js");

    const mod = await import(coreURL);
    self.createFFmpegCore = mod.default;
    if (!self.createFFmpegCore) throw ERROR_IMPORT_FAILURE;

    ffmpeg = await self.createFFmpegCore({
      mainScriptUrlOrBlob: `${coreURL}#${btoa(JSON.stringify({ wasmURL, workerURL }))}`,
    });

    ffmpeg.setLogger((data) =>
      self.postMessage({ type: FFMessageType.LOG, data })
    );
    ffmpeg.setProgress((data) =>
      self.postMessage({ type: FFMessageType.PROGRESS, data })
    );
    return true;
  } catch (e) {
    throw e;
  }
};

const exec = ({ args, timeout = -1 }) => {
  ffmpeg.setTimeout(timeout);
  ffmpeg.exec(...args);
  const ret = ffmpeg.ret;
  ffmpeg.reset();
  return ret;
};

const writeFile = ({ path, data }) => {
  ffmpeg.FS.writeFile(path, data);
  return true;
};

const readFile = ({ path, encoding }) =>
  ffmpeg.FS.readFile(path, { encoding });

const deleteFile = ({ path }) => {
  ffmpeg.FS.unlink(path);
  return true;
};

self.onmessage = async ({ data: { id, type, data } }) => {
  const trans = [];
  try {
    let result;
    if (type !== FFMessageType.LOAD && !ffmpeg) throw ERROR_NOT_LOADED;

    switch (type) {
      case FFMessageType.LOAD:
        result = await load(data);
        break;
      case FFMessageType.EXEC:
        result = exec(data);
        break;
      case FFMessageType.WRITE_FILE:
        result = writeFile(data);
        break;
      case FFMessageType.READ_FILE:
        result = readFile(data);
        break;
      case FFMessageType.DELETE_FILE:
        result = deleteFile(data);
        break;
      default:
        throw ERROR_UNKNOWN_MESSAGE_TYPE;
    }

    if (result instanceof Uint8Array) trans.push(result.buffer);
    self.postMessage({ id, type, data: result }, trans);
  } catch (e) {
    self.postMessage({
      id,
      type: FFMessageType.ERROR,
      data: e?.toString?.() || String(e),
    });
  }
};
