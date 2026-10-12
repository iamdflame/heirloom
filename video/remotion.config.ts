import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
Config.setConcurrency(8);
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setCrf(14);
Config.setX264Preset('slow');
Config.setColorSpace('bt709');
