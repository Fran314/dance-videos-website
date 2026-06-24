import type { VideoMetadata } from './ffmpeg.js'

const videoFilter = (meta: VideoMetadata, maxDimension: number): string => {
    const { colorSpace, colorTransfer, colorPrimaries: _, width, height } = meta
    const isHD = Math.max(width, height) >= 720

    const HDR_TRANSFERS = new Set([
        'smpte2084', // PQ (HDR10, HDR10+, Dolby Vision)
        'arib-std-b67', // HLG
    ])
    const isHDR = HDR_TRANSFERS.has(colorTransfer ?? '')

    const scaleFilter = `scale='if(gt(iw,ih),${maxDimension},-2)':'if(gt(iw,ih),-2,${maxDimension})'`

    if (isHDR) {
        // HDR detected, applying tone mapping
        return [
            scaleFilter,
            'zscale=t=linear:npl=100',
            'format=gbrpf32le',
            'tonemap=hable:desat=0',
            'zscale=t=bt709:m=bt709:p=bt709:r=tv',
            'format=yuv420p',
        ].join(',')
    }

    if (colorSpace && colorSpace !== 'unknown' && colorSpace !== 'bt709') {
        // Non-BT.709 detected, converting to BT.709
        return [scaleFilter, 'colorspace=all=bt709', 'format=yuv420p'].join(',')
    }

    if (!colorSpace || colorSpace === 'unknown') {
        if (!isHD) {
            // Unknown colorspace + SD resolution. Assuming BT.601, converting to BT.709
            return [
                scaleFilter,
                'colorspace=all=bt709:iall=bt601-6-625',
                'format=yuv420p',
            ].join(',')
        } else {
            // Unknown colorspace + HD resolution. Assumint BT.709, tagging output
            return [scaleFilter, 'format=yuv420p'].join(',')
        }
    }

    // Already BT.709
    return [scaleFilter, 'format=yuv420p'].join(',')
}

const conversionArgs = (
    meta: VideoMetadata,
    maxDimension: number,
): string[] => {
    const PROFILE = 'main'
    const PRESET = 'slower'
    const CRF = '26'
    const FPS = '30'

    const vfChain = videoFilter(meta, maxDimension)

    return [
        '-vf',
        vfChain,
        '-c:v',
        'libx264',
        '-profile:v',
        PROFILE,
        '-preset',
        PRESET,
        '-crf',
        CRF,
        //
        // Framerate
        '-r',
        FPS,
        //
        // Tag output to BT.709 colorspace
        '-colorspace',
        'bt709',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        //
        // Audio:
        '-c:a',
        'aac',
        '-ac',
        '2',
        //
        // Convert to fast-start for streaming
        '-movflags',
        'faststart',
    ]
}

export const videoFilter720p = (meta: VideoMetadata) => videoFilter(meta, 1280)
export const videoFilter1080p = (meta: VideoMetadata) => videoFilter(meta, 1920)
export const conversionArgs720p = (meta: VideoMetadata) =>
    conversionArgs(meta, 1280)
export const conversionArgs1080p = (meta: VideoMetadata) =>
    conversionArgs(meta, 1920)
