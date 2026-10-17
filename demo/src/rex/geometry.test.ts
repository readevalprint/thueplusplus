import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Mark from '@/components/Mark.vue'
import RexFigure from '@/components/RexFigure.vue'
import { framePose, settledSpring } from '@/sandbox/motion'
import {
  DOT_R,
  EYE_DX,
  EYE_DY,
  EYE_H,
  EYE_W,
  FOOT_DX,
  HAND_DX,
  HAND_DY,
} from '@/rex/motion'
import { MARK, hat, hatFill, markModel } from '@/rex/geometry.mjs'

describe('rex geometry', () => {
  it('rest constants match the walk engine', () => {
    expect(MARK.dotR).toBe(DOT_R)
    expect(MARK.eyeW).toBe(EYE_W)
    expect(MARK.eyeH).toBe(EYE_H)
    expect(MARK.eyeDx).toBe(EYE_DX)
    expect(MARK.eyeDy).toBe(EYE_DY)
    expect(MARK.handDx).toBe(HAND_DX)
    expect(MARK.handDy).toBe(HAND_DY)
    expect(MARK.footDx).toBe(FOOT_DX)
  })

  it('hero figure draws the shared hat at the rest pose', () => {
    const pose = framePose({
      mode: 'idle',
      t: 0,
      clock: 0,
      lever: 0,
      reduced: true,
      spring: settledSpring(),
      dt: 0,
    })
    const wrapper = mount(RexFigure, { props: { pose } })
    const crowns = wrapper.findAll('path').filter(node => node.attributes('d') === hat.crown)
    expect(crowns).toHaveLength(2)
    expect(wrapper.find('ellipse').attributes()).toMatchObject({
      cx: String(hat.brim.cx),
      cy: String(hat.brim.cy),
      rx: String(hat.brim.rx),
      ry: String(hat.brim.ry),
      fill: hatFill,
    })
    const eyes = wrapper.findAll('[data-test="rex-eye"]')
    expect(eyes).toHaveLength(2)
    expect(eyes[0].attributes('x')).toBe(String(pose.eyeLX - MARK.eyeW / 2))
    expect(eyes[0].attributes('width')).toBe(String(MARK.eyeW))
    expect(eyes[0].attributes('height')).toBe(String(pose.eyeH))
    expect(wrapper.find('[data-test="rex-dot"]').attributes('r')).toBe(String(MARK.dotR))
    expect(wrapper.findAll('[data-test="rex-dot"]')).toHaveLength(4)
  })

  it('header mark is the static rex and does not reuse the hero test ids', () => {
    const wrapper = mount(Mark)
    expect(wrapper.text()).not.toContain('++')
    expect(wrapper.find('[data-test="header-mark"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rex-eye"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="hard-hat"]').exists()).toBe(false)
    expect(wrapper.findAll('.rex-eye')).toHaveLength(2)
    expect(wrapper.findAll('circle')).toHaveLength(4)
    expect(wrapper.find('path').attributes('d')).toBe(hat.crown)
    expect(wrapper.find('path').attributes('fill')).toBe('var(--signal)')
    expect(wrapper.find('.rex-eye').attributes('fill')).toBe('currentColor')
    const model = markModel('header')
    expect(model.parts.filter(part => part.role === 'eye')).toHaveLength(2)
    expect(model.parts.filter(part => part.role === 'dot')).toHaveLength(4)
  })
})
