const baseUrl = process.env.RHN_API_URL ?? 'http://127.0.0.1:8080'
const username = process.env.RHN_DEV_USERNAME ?? 'doctor'
const password = process.env.RHN_DEV_PASSWORD ?? 'rhn-dev-2026'

const tenantId = '362387869790209'
const organizationId = '362387869790211'
const warehouseDepartmentId = '362387869799102'
const outpatientDepartmentId = '362387869799103'
const warehouseSiteId = '362387869799501'
const outpatientSiteId = '362387869799502'
const marker = 'SHOWCASE-20260830'

const products = [
  { catalogItemId: '362387869795111', packageId: '362387869795401', name: '阿莫西林胶囊 0.25g', factor: 24,
    traceRequired: true, splitAllowed: true, coldChain: false, highAlert: false },
  { catalogItemId: '362387869795112', packageId: '362387869795402', name: '盐酸二甲双胍片 0.5g', factor: 20,
    traceRequired: false, splitAllowed: true, coldChain: false, highAlert: false },
  { catalogItemId: '362387869795113', packageId: '362387869795403', name: '苯磺酸氨氯地平片 5mg', factor: 14,
    traceRequired: false, splitAllowed: true, coldChain: false, highAlert: true },
]

const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

function headers(departmentId, withBody = false) {
  return {
    Authorization: auth,
    'X-Tenant-Id': tenantId,
    'X-Organization-Id': organizationId,
    'X-Department-Id': departmentId,
    'X-Client-Session-Id': '11111111-2222-3333-4444-555555555555',
    ...(withBody ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function api(method, endpoint, { body, departmentId = warehouseDepartmentId } = {}) {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: headers(departmentId, body !== undefined),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const value = text ? JSON.parse(text) : null
  if (!response.ok) {
    const detail = value?.code ? `${value.code}: ${value.message}` : text
    throw new Error(`${method} ${endpoint} -> ${response.status} ${detail}`)
  }
  return value
}

const get = (endpoint, departmentId) => api('GET', endpoint, { departmentId })
const post = (endpoint, body, departmentId) => api('POST', endpoint, { body, departmentId })

async function ensureStockItem(siteId, departmentId, product) {
  const values = await get(`/api/pharmacy/stock-sites/${siteId}/stock-items`, departmentId)
  const existing = values.find(value => value.catalogItemId === product.catalogItemId)
  if (existing) return existing
  return post(`/api/pharmacy/stock-sites/${siteId}/stock-items`, {
    catalogItemId: product.catalogItemId,
    packageId: product.packageId,
    issuePolicy: 'FEFO',
    negativeAllowed: false,
    lotRequired: true,
    traceRequired: product.traceRequired,
    splitAllowed: product.splitAllowed,
    coldChain: product.coldChain,
    controlled: false,
    highAlert: product.highAlert,
  }, departmentId)
}

async function ensureBin(siteId, departmentId, input) {
  const values = await get(`/api/pharmacy/stock-sites/${siteId}/stock-bins`, departmentId)
  const existing = values.find(value => value.code === input.code)
  if (existing) return existing
  return post(`/api/pharmacy/stock-sites/${siteId}/stock-bins`, {
    binType: 'BIN', stockDefault: 'AVAILABLE', receiveAllowed: true,
    pickAllowed: true, countAllowed: true, sortOrder: 10, ...input,
  }, departmentId)
}

async function ensureSupplier() {
  const values = await get(`/api/pharmacy/suppliers?organizationId=${organizationId}`)
  const existing = values.find(value => value.code === 'SUP-SHOWCASE')
  const supplier = existing ?? await post('/api/pharmacy/suppliers', {
    organizationId,
    code: 'SUP-SHOWCASE',
    name: '华康医药配送有限公司',
    unifiedCreditCode: '91330100SHOWCASE01',
    licenseNo: '浙AA5710001',
    licenseValidTo: '2029-12-31',
    contactName: '王敏',
    contactPhone: '13800001234',
    validFrom: '2026-01-01',
  })
  const supplies = await get(`/api/pharmacy/suppliers/${supplier.id}/supply-items`)
  for (const [index, product] of products.entries()) {
    if (supplies.some(value => value.catalogItemId === product.catalogItemId)) continue
    await post(`/api/pharmacy/suppliers/${supplier.id}/supply-items`, {
      catalogItemId: product.catalogItemId,
      packageId: product.packageId,
      agreementPrice: [12.8, 6.5, 18.6][index],
      taxRate: 0.13,
      validFrom: '2026-01-01',
    })
  }
  return supplier
}

async function orderByRequestCode(requestCode) {
  return (await get(`/api/pharmacy/purchase-orders?stockSiteId=${warehouseSiteId}`))
    .find(value => value.requestCode === requestCode)
}

async function ensureApprovedOrder(supplierId, requestCode, lines, description) {
  let order = await orderByRequestCode(requestCode)
  if (!order) {
    order = await post('/api/pharmacy/purchase-orders', {
      stockSiteId: warehouseSiteId,
      supplierId,
      requestCode,
      orderDate: '2026-08-29',
      expectedDate: '2026-08-31',
      description,
      lines,
    })
  }
  if (order.status === 'DRAFT') order = await post(`/api/pharmacy/purchase-orders/${order.id}/submit`)
  if (order.status === 'SUBMITTED') {
    order = await post(`/api/pharmacy/purchase-orders/${order.id}/approve`, { reason: '演示数据审批通过' })
  }
  return order
}

async function receiptByRequestCode(requestCode) {
  return (await get(`/api/pharmacy/goods-receipts?stockSiteId=${warehouseSiteId}`))
    .find(value => value.requestCode === requestCode)
}

async function ensurePostedReceipt(order, requestCode, lineInputs, traceCodes = []) {
  let receipt = await receiptByRequestCode(requestCode)
  if (!receipt) {
    receipt = await post('/api/pharmacy/goods-receipts', {
      purchaseOrderId: order.id,
      requestCode,
      deliveryNoteNo: `DN-${requestCode}`,
      receivedAt: '2026-08-30T01:20:00Z',
      description: '真实数据库展示样例：逐批到货验收',
      lines: lineInputs.map(input => ({
        purchaseOrderLineId: order.lines.find(line => line.stockItemId === input.stockItemId).id,
        destinationBinId: input.destinationBinId,
        lotNo: input.lotNo,
        productionDate: input.productionDate,
        expiryDate: input.expiryDate,
        deliveredQuantity: input.deliveredQuantity,
        unitCost: input.unitCost,
      })),
    })
  }
  if (receipt.status === 'RECEIVED' || receipt.status === 'INSPECTING') {
    receipt = await post(`/api/pharmacy/goods-receipts/${receipt.id}/inspect`, {
      description: '核对随货同行单、批号、效期与包装完整性',
      lines: lineInputs.map(input => ({
        goodsReceiptLineId: receipt.lines.find(line => line.stockItemId === input.stockItemId).id,
        acceptedQuantity: input.acceptedQuantity,
        rejectedQuantity: input.rejectedQuantity,
        rejectionReason: input.rejectionReason,
      })),
    })
  }
  if (traceCodes.length && receipt.status !== 'POSTED') {
    const summary = await get(`/api/pharmacy/goods-receipts/${receipt.id}/trace-codes/summary`)
    if (!summary.complete) {
      const traceLine = receipt.lines.find(line => line.stockItemId === traceCodes[0].stockItemId)
      await post(`/api/pharmacy/goods-receipts/${receipt.id}/trace-codes`, {
        lines: [{ goodsReceiptLineId: traceLine.id, traceCodes: traceCodes.map(value => value.code) }],
      })
    }
  }
  if (['ACCEPTED', 'PARTIALLY_ACCEPTED'].includes(receipt.status)) {
    receipt = await post(`/api/pharmacy/goods-receipts/${receipt.id}/post`)
  }
  return receipt
}

async function ensureRequisition(sourceItems, requestCode, targetStatus) {
  let value = (await get(`/api/pharmacy/stock-requisitions?sourceSiteId=${warehouseSiteId}`))
    .find(item => item.requestCode === requestCode)
  const inputs = targetStatus === 'ISSUED'
    ? [{ item: sourceItems[2], requested: 28 }]
    : [{ item: sourceItems[0], requested: 48 }, { item: sourceItems[1], requested: 60 }]
  if (!value) {
    value = await post('/api/pharmacy/stock-requisitions', {
      sourceSiteId: warehouseSiteId,
      requestingDepartmentId: outpatientDepartmentId,
      requestCode,
      requestedAt: '2026-08-30T02:10:00Z',
      reason: targetStatus === 'ISSUED' ? '高血压慢病门诊补充基数' : '门诊药房周转库存补充',
      description: '由门诊药房发起，药库统一审核与拣货',
      lines: inputs.map(({ item, requested }) => ({
        stockItemId: item.id, requestedQuantity: requested, description: '按基本单位请领',
      })),
    }, outpatientDepartmentId)
  }
  if (value.status === 'DRAFT') {
    value = await post(`/api/pharmacy/stock-requisitions/${value.id}/submit`, undefined, outpatientDepartmentId)
  }
  if (targetStatus === 'ISSUED' && value.status === 'SUBMITTED') {
    value = await post(`/api/pharmacy/stock-requisitions/${value.id}/approve`, {
      reason: '核对消耗与库存上限后同意',
      lines: value.lines.map(line => ({ requisitionLineId: line.id, approvedQuantity: line.requestedQuantity })),
    })
  }
  if (targetStatus === 'ISSUED' && value.status === 'APPROVED') {
    value = await post(`/api/pharmacy/stock-requisitions/${value.id}/pick`)
  }
  if (targetStatus === 'ISSUED' && value.status === 'PICKING') {
    value = await post(`/api/pharmacy/stock-requisitions/${value.id}/issue`)
  }
  return value
}

async function ensureTransfer(sourceItems, destinationItems, destinationBin, requestCode, targetStatus) {
  let value = (await get(`/api/pharmacy/stock-transfers?stockSiteId=${warehouseSiteId}`))
    .find(item => item.requestCode === requestCode)
  const index = targetStatus === 'COMPLETED' ? 1 : 2
  const requested = targetStatus === 'COMPLETED' ? 20 : 24
  if (!value) {
    value = await post('/api/pharmacy/stock-transfers', {
      sourceSiteId: warehouseSiteId,
      destinationSiteId: outpatientSiteId,
      requestCode,
      requestedAt: '2026-08-30T03:00:00Z',
      reason: targetStatus === 'COMPLETED' ? '门诊药房慢病用药补货' : '门诊药房抗菌药物补货',
      description: '展示批次连续、在途与收货差异处理',
      lines: [{
        sourceStockItemId: sourceItems[index].id,
        destinationStockItemId: destinationItems[index].id,
        requestedQuantity: requested,
      }],
    })
  }
  if (value.status === 'DRAFT') value = await post(`/api/pharmacy/stock-transfers/${value.id}/submit`)
  if (value.status === 'SUBMITTED') {
    value = await post(`/api/pharmacy/stock-transfers/${value.id}/approve`, {
      reason: '同意调拨',
      lines: value.lines.map(line => ({ transferLineId: line.id, approvedQuantity: line.requestedQuantity })),
    })
  }
  if (value.status === 'APPROVED') value = await post(`/api/pharmacy/stock-transfers/${value.id}/pick`)
  if (value.status === 'PICKING') value = await post(`/api/pharmacy/stock-transfers/${value.id}/dispatch`)
  if (targetStatus === 'COMPLETED' && value.status === 'IN_TRANSIT') {
    value = await post(`/api/pharmacy/stock-transfers/${value.id}/receive`, {
      reason: '收货复核发现外箱挤压，2片转破损库存',
      allocations: value.lines.flatMap(line => line.allocations.map(allocation => ({
        transferAllocationId: allocation.id,
        destinationBinId: destinationBin.id,
        receivedQuantity: Math.max(0, Number(allocation.dispatchedQuantity) - 2),
        damagedQuantity: Math.min(2, Number(allocation.dispatchedQuantity)),
        discrepancyReason: '运输外箱挤压，隔离待处理',
      }))),
    }, outpatientDepartmentId)
  }
  return value
}

async function ensureCount(sourceItems, requestCode, stockItemId, targetStatus, variance = 0) {
  let value = (await get(`/api/pharmacy/stock-counts?stockSiteId=${warehouseSiteId}`))
    .find(item => item.requestCode === requestCode)
  if (!value) {
    value = await post('/api/pharmacy/stock-counts', {
      stockSiteId: warehouseSiteId,
      requestCode,
      countType: 'ITEM',
      stockItemIds: [stockItemId],
      reason: targetStatus === 'POSTED' ? '重点品种抽盘' : '慢病药品循环盘点',
      description: '按经营项目冻结账面快照',
    })
  }
  if (targetStatus !== 'DRAFT' && value.status === 'DRAFT') {
    value = await post(`/api/pharmacy/stock-counts/${value.id}/start`)
  }
  if (targetStatus === 'POSTED' && value.status === 'COUNTING') {
    value = await post(`/api/pharmacy/stock-counts/${value.id}/records`, {
      description: '双人复盘后录入实盘结果',
      lines: value.lines.map((line, index) => ({
        countLineId: line.id,
        countedQuantity: Math.max(0, Number(line.bookQuantity) + (index === 0 ? variance : 0)),
        varianceReason: index === 0 && variance !== 0 ? '拆零发放尾差，复盘确认' : undefined,
      })),
    })
  }
  if (targetStatus === 'POSTED' && value.status === 'COUNTING' && value.lines.length === 0) {
    throw new Error(`盘点 ${requestCode} 没有形成盘点行`)
  }
  if (targetStatus === 'POSTED' && value.status === 'COUNTING') {
    value = await post(`/api/pharmacy/stock-counts/${value.id}/submit`)
  }
  if (targetStatus === 'POSTED' && value.status === 'SUBMITTED') {
    value = await post(`/api/pharmacy/stock-counts/${value.id}/approve`, { reason: '差异复核通过' })
  }
  if (targetStatus === 'POSTED' && value.status === 'APPROVED') {
    value = await post(`/api/pharmacy/stock-counts/${value.id}/post`)
  }
  return value
}

async function ensureOpenPackage(stockItem, lotId, binId) {
  const values = await get(`/api/pharmacy/inventory/open-packages?stockSiteId=${warehouseSiteId}`)
  const existing = values.find(value => value.requestCode === `${marker}-OPEN-AMOX`)
  if (existing) return existing
  return post('/api/pharmacy/inventory/open-packages', {
    requestCode: `${marker}-OPEN-AMOX`,
    stockSiteId: warehouseSiteId,
    stockBinId: binId,
    stockItemId: stockItem.id,
    stockLotId: lotId,
    occurredAt: '2026-08-30T04:30:00Z',
    description: '门诊拆零补给，开封一盒并绑定追溯码',
  })
}

async function main() {
  console.log('1/8 维护经营项目与库位')
  const sourceItems = []
  const destinationItems = []
  for (const product of products) {
    sourceItems.push(await ensureStockItem(warehouseSiteId, warehouseDepartmentId, product))
    destinationItems.push(await ensureStockItem(outpatientSiteId, outpatientDepartmentId, {
      ...product, traceRequired: false,
    }))
  }
  const warehouseBins = [
    await ensureBin(warehouseSiteId, warehouseDepartmentId, { code: 'RCV-A', name: '收货验收区', sortOrder: 10 }),
    await ensureBin(warehouseSiteId, warehouseDepartmentId, { code: 'PICK-A', name: '常温药品拣货位', sortOrder: 20 }),
    await ensureBin(warehouseSiteId, warehouseDepartmentId, { code: 'QA-A', name: '待验隔离区', stockDefault: 'QUARANTINE', pickAllowed: false, sortOrder: 30 }),
  ]
  const destinationBin = await ensureBin(outpatientSiteId, outpatientDepartmentId, {
    code: 'OP-RCV-A', name: '门诊药房收货位', sortOrder: 10,
  })

  console.log('2/8 维护供应商与供应目录')
  const supplier = await ensureSupplier()

  console.log('3/8 生成采购、到货、验收、追溯与入库样例')
  const fullOrder = await ensureApprovedOrder(supplier.id, `${marker}-PO-FULL`, sourceItems.map((item, index) => ({
    stockItemId: item.id, packageId: products[index].packageId,
    orderedQuantity: [12, 15, 10][index], unitPrice: [12.8, 6.5, 18.6][index], taxRate: 0.13,
    description: ['抗菌药物月度采购', '慢病药品常备采购', '高警示标识展示品种'][index],
  })), '三品种批量采购，包含部分拒收与追溯码登记')
  const traceCodes = Array.from({ length: 11 }, (_, index) => ({
    stockItemId: sourceItems[0].id,
    code: `869000000001${String(index + 1).padStart(3, '0')}${marker.slice(-4)}`,
  }))
  const fullReceipt = await ensurePostedReceipt(fullOrder, `${marker}-GR-FULL`, [
    { stockItemId: sourceItems[0].id, destinationBinId: warehouseBins[1].id, lotNo: 'AMX-260801', productionDate: '2026-08-01', expiryDate: '2027-10-31', deliveredQuantity: 12, acceptedQuantity: 11, rejectedQuantity: 1, rejectionReason: '1盒外包装破损', unitCost: 12.8 },
    { stockItemId: sourceItems[1].id, destinationBinId: warehouseBins[1].id, lotNo: 'MET-260715', productionDate: '2026-07-15', expiryDate: '2028-07-14', deliveredQuantity: 15, acceptedQuantity: 15, rejectedQuantity: 0, unitCost: 6.5 },
    { stockItemId: sourceItems[2].id, destinationBinId: warehouseBins[1].id, lotNo: 'AML-260620', productionDate: '2026-06-20', expiryDate: '2028-06-19', deliveredQuantity: 10, acceptedQuantity: 10, rejectedQuantity: 0, unitCost: 18.6 },
  ], traceCodes)
  const partialOrder = await ensureApprovedOrder(supplier.id, `${marker}-PO-PARTIAL`, [{
    stockItemId: sourceItems[1].id, packageId: products[1].packageId,
    orderedQuantity: 18, unitPrice: 6.5, taxRate: 0.13, description: '分批配送订单',
  }], '展示部分到货状态')
  await ensurePostedReceipt(partialOrder, `${marker}-GR-PARTIAL`, [{
    stockItemId: sourceItems[1].id, destinationBinId: warehouseBins[1].id, lotNo: 'MET-260820',
    productionDate: '2026-08-20', expiryDate: '2028-08-19', deliveredQuantity: 6,
    acceptedQuantity: 6, rejectedQuantity: 0, unitCost: 6.5,
  }])
  await ensureApprovedOrder(supplier.id, `${marker}-PO-PENDING`, [{
    stockItemId: sourceItems[0].id, packageId: products[0].packageId,
    orderedQuantity: 20, unitPrice: 12.6, taxRate: 0.13, description: '待到货采购订单',
  }], '已审批，等待供应商送货')

  console.log('4/8 生成科室请领待审与已出库样例')
  await ensureRequisition(sourceItems, `${marker}-REQ-SUBMITTED`, 'SUBMITTED')
  await ensureRequisition(sourceItems, `${marker}-REQ-ISSUED`, 'ISSUED')

  console.log('5/8 生成库间调拨在途与差异收货样例')
  await ensureTransfer(sourceItems, destinationItems, destinationBin, `${marker}-TR-INTRANSIT`, 'IN_TRANSIT')
  await ensureTransfer(sourceItems, destinationItems, destinationBin, `${marker}-TR-COMPLETED`, 'COMPLETED')

  console.log('6/8 生成盘点差异与盘点中样例')
  await ensureCount(sourceItems, `${marker}-COUNT-POSTED`, sourceItems[2].id, 'POSTED', -1)
  await ensureCount(sourceItems, `${marker}-COUNT-COUNTING`, sourceItems[1].id, 'COUNTING')

  console.log('7/8 生成拆零与追溯样例')
  const amoxicillinReceiptLine = fullReceipt.lines.find(line => line.stockItemId === sourceItems[0].id)
  await ensureOpenPackage(sourceItems[0], amoxicillinReceiptLine.stockLotId, warehouseBins[1].id)

  console.log('8/8 执行账目校验')
  let reconciliation
  try {
    reconciliation = await get(`/api/pharmacy/inventory/reconciliations/latest?stockSiteId=${warehouseSiteId}`)
  } catch {
    reconciliation = null
  }
  if (!reconciliation) {
    reconciliation = await post(`/api/pharmacy/inventory/reconciliations?stockSiteId=${warehouseSiteId}`)
  }

  const summary = {
    stockItems: (await get(`/api/pharmacy/stock-sites/${warehouseSiteId}/stock-items`)).length,
    bins: (await get(`/api/pharmacy/stock-sites/${warehouseSiteId}/stock-bins`)).length,
    suppliers: (await get(`/api/pharmacy/suppliers?organizationId=${organizationId}`)).length,
    purchaseOrders: (await get(`/api/pharmacy/purchase-orders?stockSiteId=${warehouseSiteId}`)).length,
    receipts: (await get(`/api/pharmacy/goods-receipts?stockSiteId=${warehouseSiteId}`)).length,
    requisitions: (await get(`/api/pharmacy/stock-requisitions?sourceSiteId=${warehouseSiteId}`)).length,
    transfers: (await get(`/api/pharmacy/stock-transfers?stockSiteId=${warehouseSiteId}`)).length,
    counts: (await get(`/api/pharmacy/stock-counts?stockSiteId=${warehouseSiteId}`)).length,
    traceCodes: (await get(`/api/pharmacy/inventory/trace-codes?stockSiteId=${warehouseSiteId}`)).length,
    openPackages: (await get(`/api/pharmacy/inventory/open-packages?stockSiteId=${warehouseSiteId}`)).length,
    reconciliation: reconciliation.status,
  }
  console.log(JSON.stringify(summary, null, 2))
}

main().catch(error => {
  console.error(error.stack ?? error)
  process.exitCode = 1
})
