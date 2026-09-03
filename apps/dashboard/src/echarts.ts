import { BarChart, GaugeChart, LineChart, PieChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { init, use, type EChartsType } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

use([
  AriaComponent,
  BarChart,
  CanvasRenderer,
  GaugeChart,
  GridComponent,
  LegendComponent,
  LineChart,
  PieChart,
  TooltipComponent
])

export { init }
export type { EChartsType }
export type { EChartsOption } from 'echarts'
