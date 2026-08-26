import type { FarmAdministrativeAddress, FarmStore } from './index'
import { isValidChinaCoordinate } from './geocoding'

export type DashboardRegionLevel = 'province' | 'city' | 'district'

export interface DashboardRegionNode {
  code: string
  name: string
  level: DashboardRegionLevel
  parentCode?: string
  geoCode: string
}

const province: DashboardRegionNode = { code: '43', name: '湖南省', level: 'province', geoCode: '430000' }

const cities: Array<[string, string]> = [
  ['4301', '长沙市'], ['4302', '株洲市'], ['4303', '湘潭市'], ['4304', '衡阳市'], ['4305', '邵阳市'],
  ['4306', '岳阳市'], ['4307', '常德市'], ['4308', '张家界市'], ['4309', '益阳市'], ['4310', '郴州市'],
  ['4311', '永州市'], ['4312', '怀化市'], ['4313', '娄底市'], ['4331', '湘西州']
]

const districts: Array<[string, string, string]> = [
  ['430102', '芙蓉区', '4301'], ['430103', '天心区', '4301'], ['430104', '岳麓区', '4301'], ['430105', '开福区', '4301'], ['430111', '雨花区', '4301'], ['430112', '望城区', '4301'], ['430121', '长沙县', '4301'], ['430181', '浏阳市', '4301'], ['430182', '宁乡市', '4301'],
  ['430202', '荷塘区', '4302'], ['430203', '芦淞区', '4302'], ['430204', '石峰区', '4302'], ['430211', '天元区', '4302'], ['430212', '渌口区', '4302'], ['430223', '攸县', '4302'], ['430224', '茶陵县', '4302'], ['430225', '炎陵县', '4302'], ['430281', '醴陵市', '4302'],
  ['430302', '雨湖区', '4303'], ['430304', '岳塘区', '4303'], ['430321', '湘潭县', '4303'], ['430381', '湘乡市', '4303'], ['430382', '韶山市', '4303'],
  ['430405', '珠晖区', '4304'], ['430406', '雁峰区', '4304'], ['430407', '石鼓区', '4304'], ['430408', '蒸湘区', '4304'], ['430412', '南岳区', '4304'], ['430421', '衡阳县', '4304'], ['430422', '衡南县', '4304'], ['430423', '衡山县', '4304'], ['430424', '衡东县', '4304'], ['430426', '祁东县', '4304'], ['430481', '耒阳市', '4304'], ['430482', '常宁市', '4304'],
  ['430502', '双清区', '4305'], ['430503', '大祥区', '4305'], ['430511', '北塔区', '4305'], ['430522', '新邵县', '4305'], ['430523', '邵阳县', '4305'], ['430524', '隆回县', '4305'], ['430525', '洞口县', '4305'], ['430527', '绥宁县', '4305'], ['430528', '新宁县', '4305'], ['430529', '城步苗族自治县', '4305'], ['430581', '武冈市', '4305'], ['430582', '邵东市', '4305'],
  ['430602', '岳阳楼区', '4306'], ['430603', '云溪区', '4306'], ['430611', '君山区', '4306'], ['430621', '岳阳县', '4306'], ['430623', '华容县', '4306'], ['430624', '湘阴县', '4306'], ['430626', '平江县', '4306'], ['430681', '汨罗市', '4306'], ['430682', '临湘市', '4306'],
  ['430702', '武陵区', '4307'], ['430703', '鼎城区', '4307'], ['430721', '安乡县', '4307'], ['430722', '汉寿县', '4307'], ['430723', '澧县', '4307'], ['430724', '临澧县', '4307'], ['430725', '桃源县', '4307'], ['430726', '石门县', '4307'], ['430781', '津市市', '4307'],
  ['430802', '永定区', '4308'], ['430811', '武陵源区', '4308'], ['430821', '慈利县', '4308'], ['430822', '桑植县', '4308'],
  ['430902', '资阳区', '4309'], ['430903', '赫山区', '4309'], ['430921', '南县', '4309'], ['430922', '桃江县', '4309'], ['430923', '安化县', '4309'], ['430981', '沅江市', '4309'],
  ['431002', '北湖区', '4310'], ['431003', '苏仙区', '4310'], ['431021', '桂阳县', '4310'], ['431022', '宜章县', '4310'], ['431023', '永兴县', '4310'], ['431024', '嘉禾县', '4310'], ['431025', '临武县', '4310'], ['431026', '汝城县', '4310'], ['431027', '桂东县', '4310'], ['431028', '安仁县', '4310'], ['431081', '资兴市', '4310'],
  ['431102', '零陵区', '4311'], ['431103', '冷水滩区', '4311'], ['431121', '祁阳市', '4311'], ['431122', '东安县', '4311'], ['431123', '双牌县', '4311'], ['431124', '道县', '4311'], ['431125', '江永县', '4311'], ['431126', '宁远县', '4311'], ['431127', '蓝山县', '4311'], ['431128', '新田县', '4311'], ['431129', '江华瑶族自治县', '4311'],
  ['431202', '鹤城区', '4312'], ['431221', '中方县', '4312'], ['431222', '沅陵县', '4312'], ['431223', '辰溪县', '4312'], ['431224', '溆浦县', '4312'], ['431225', '会同县', '4312'], ['431226', '麻阳苗族自治县', '4312'], ['431227', '新晃侗族自治县', '4312'], ['431228', '芷江侗族自治县', '4312'], ['431229', '靖州苗族侗族自治县', '4312'], ['431230', '通道侗族自治县', '4312'], ['431281', '洪江市', '4312'],
  ['431302', '娄星区', '4313'], ['431321', '双峰县', '4313'], ['431322', '新化县', '4313'], ['431381', '冷水江市', '4313'], ['431382', '涟源市', '4313'],
  ['433101', '吉首市', '4331'], ['433122', '泸溪县', '4331'], ['433123', '凤凰县', '4331'], ['433124', '花垣县', '4331'], ['433125', '保靖县', '4331'], ['433126', '古丈县', '4331'], ['433127', '永顺县', '4331'], ['433130', '龙山县', '4331']
]

export const DASHBOARD_REGIONS: readonly DashboardRegionNode[] = [
  province,
  ...cities.map(([code, name]): DashboardRegionNode => ({ code, name, level: 'city', parentCode: '43', geoCode: `${code}00` })),
  ...districts.map(([code, name, parentCode]): DashboardRegionNode => ({ code, name, level: 'district', parentCode, geoCode: code }))
]

const regionByCode = new Map(DASHBOARD_REGIONS.map((item) => [item.code, item]))

export function dashboardRegion(code: string): DashboardRegionNode | undefined {
  return regionByCode.get(code)
}

export function isDashboardRegionCode(code: string): boolean {
  return regionByCode.has(code)
}

export function dashboardRegionChildren(code: string): DashboardRegionNode[] {
  return DASHBOARD_REGIONS.filter((item) => item.parentCode === code)
}

export function dashboardRegionPath(code: string): DashboardRegionNode[] {
  const path: DashboardRegionNode[] = []
  let current = dashboardRegion(code)
  while (current) {
    path.unshift(current)
    current = current.parentCode ? dashboardRegion(current.parentCode) : undefined
  }
  return path
}

export function dashboardRegionAllowed(code: string, allowedCodes: readonly string[]): boolean {
  return isDashboardRegionCode(code) && allowedCodes.some((allowed) => isDashboardRegionCode(allowed) && code.startsWith(allowed))
}

export function buildFarmAdministrativeAddress(districtCode: string, detail: string): FarmAdministrativeAddress {
  const district = dashboardRegion(districtCode)
  const city = district?.parentCode ? dashboardRegion(district.parentCode) : undefined
  if (!district || district.level !== 'district' || !city) throw new Error('请选择有效县区')
  const normalizedDetail = detail.trim()
  if (!normalizedDetail) throw new Error('请填写详细地址')
  return {
    provinceCode: province.code,
    province: province.name,
    cityCode: city.code,
    city: city.name,
    districtCode: district.code,
    district: district.name,
    detail: normalizedDetail
  }
}

export function formatFarmAdministrativeAddress(address: FarmAdministrativeAddress): string {
  return `${address.province}${address.city}${address.district}${address.detail}`
}

export function migrateFarmAdministrativeAddress(farm: FarmStore): FarmStore {
  if (farm.structuredAddress && dashboardRegion(farm.structuredAddress.districtCode || '')?.level === 'district') return farm
  const districtCode = [farm.regionCode, farm.location?.adCode].find((code) => !!code && dashboardRegion(code)?.level === 'district')
  const district = districtCode ? dashboardRegion(districtCode) : undefined
  const city = district?.parentCode ? dashboardRegion(district.parentCode) : undefined
  const sourceAddress = farm.address?.trim() || ''
  const districtPosition = district ? sourceAddress.lastIndexOf(district.name) : -1
  const detail = districtPosition >= 0 ? sourceAddress.slice(districtPosition + district!.name.length).trim() : ''
  if (!district || !city || !detail) return farm
  const structuredAddress = buildFarmAdministrativeAddress(district.code, detail)
  return {
    ...farm,
    regionCode: district.code,
    structuredAddress,
    city: city.name,
    region: `${city.name}${district.name}`,
    address: formatFarmAdministrativeAddress(structuredAddress)
  }
}

export function isResolvedFarmLocation(farm: Pick<FarmStore, 'location' | 'locationStatus' | 'regionCode' | 'structuredAddress'>): boolean {
  const location = farm.location
  if (farm.locationStatus !== 'resolved' || !location) return false
  if (!isValidChinaCoordinate(location.longitude, location.latitude)) return false
  if (!/^\d{6}$/.test(location.adCode) || !isDashboardRegionCode(location.adCode)) return false
  const districtCode = farm.regionCode || farm.structuredAddress?.districtCode
  return !districtCode || districtCode === location.adCode
}
