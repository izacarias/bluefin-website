import { describe, expect, it } from 'vitest'
import { classifyGPU } from './useHardwareDetection'

describe('classifyGPU — nvidia (RTX gate: open driver supported)', () => {
  it('RTX card → nvidia', () => {
    expect(classifyGPU('NVIDIA GeForce RTX 3080')).toBe('nvidia')
  })

  it('GTX 16xx card → nvidia', () => {
    expect(classifyGPU('NVIDIA GeForce GTX 1660')).toBe('nvidia')
    expect(classifyGPU('NVIDIA GeForce GTX1660')).toBe('nvidia')
  })

  it('ANGLE renderer with RTX → nvidia', () => {
    expect(classifyGPU('ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.6109)')).toBe('nvidia')
  })
})

describe('classifyGPU — nvidia-legacy (older than GTX 16xx, open driver not supported)', () => {
  it('GTX 10xx → nvidia-legacy', () => {
    expect(classifyGPU('NVIDIA GeForce GTX 1080')).toBe('nvidia-legacy')
  })
})

describe('classifyGPU — AMD, Intel, other', () => {
  it('AMD → amd', () => {
    expect(classifyGPU('AMD Radeon RX 7900 XTX')).toBe('amd')
  })

  it('Intel → intel', () => {
    expect(classifyGPU('Intel UHD Graphics 630')).toBe('intel')
  })

  it('unknown GPU → other', () => {
    expect(classifyGPU('Apple M2')).toBe('other')
  })
})
