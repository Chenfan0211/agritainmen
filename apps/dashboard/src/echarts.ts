import { BarChart, EffectScatterChart, GaugeChart, LineChart, MapChart, PieChart, ScatterChart } from 'echarts/charts'
import { AriaComponent, GeoComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, registerMap, use, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([
  AriaComponent,
  BarChart,
  CanvasRenderer,
  EffectScatterChart,
  GaugeChart,
  GeoComponent,
  GridComponent,
  LegendComponent,
  LineChart,
  MapChart,
  PieChart,
  ScatterChart,
  TooltipComponent
])

export { init, registerMap }
export type { EChartsType }
export type { EChartsOption } from 'echarts'
