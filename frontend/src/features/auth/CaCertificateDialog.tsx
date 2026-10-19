import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DEVELOPMENT_CA_VENDOR, errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, LoadingState, StatusBadge } from '../../shared/ui'

const MEDIUM_LABELS: Record<string, string> = { MOBILE: '手机证书', UKEY: 'UKey' }
const STATUS_LABELS: Record<string, string> = { ACTIVE: '有效', SUSPENDED: '已暂停', REVOKED: '已作废' }

/** 当前账号绑定的 CA 签名人与证书；用于扫码 / 证书登录和可选的个人 CA 签名。 */
export function CaCertificateDialog({ api, onClose }: { api: RhnApi; onClose: () => void }) {
  const queryClient = useQueryClient()
  const capability = useQuery({ queryKey: ['ca-signing-capability'], queryFn: () => api.caSigners.capability() })
  const signers = useQuery({ queryKey: ['ca-signers-mine'], queryFn: () => api.caSigners.mine() })
  const enroll = useMutation({
    mutationFn: () => api.caSigners.enrollDevelopment(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ca-signers-mine'] })
      void queryClient.invalidateQueries({ queryKey: ['ca-signing-capability'] })
    },
  })
  const development = capability.data?.vendorCode === DEVELOPMENT_CA_VENDOR

  return <Dialog title="我的 CA 证书" eyebrow="账号安全" onClose={onClose}
    description="绑定后可用手机扫码或 UKey 登录，并在病历、处方等场景附加个人 CA 签名；未绑定不影响口令登录和业务办理。"
    actions={development ? <Button busy={enroll.isPending} onClick={() => enroll.mutate()}>签发开发证书</Button> : undefined}>
    {capability.data && !capability.data.enabled && <Alert placement="inline" tone="info">当前机构未启用 CA。</Alert>}
    {development && <Alert placement="inline" tone="warning">
      开发模拟 CA 的密钥只保存在后端内存中，后端重启后需重新签发。
    </Alert>}
    {enroll.error && <Alert placement="inline">{errorMessage(enroll.error)}</Alert>}
    {signers.isLoading ? <LoadingState />
      : signers.error ? <Alert placement="inline">{errorMessage(signers.error)}</Alert>
        : !signers.data?.length ? <EmptyState icon="lock" title="尚未绑定 CA 证书" copy="请联系管理员按 CA 厂商备案结果绑定。" />
          : <ul className="ca-signer-list">
            {signers.data.map((signer) => <li key={signer.id}>
              <div>
                <strong>{signer.certificateSubject || signer.externalSignerId}</strong>
                <small>{signer.vendorCode} · {MEDIUM_LABELS[signer.medium ?? ''] ?? signer.medium}
                  {signer.certificateNotAfter && ` · 有效期至 ${signer.certificateNotAfter.slice(0, 10)}`}</small>
              </div>
              <StatusBadge tone={signer.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {STATUS_LABELS[signer.status ?? ''] ?? signer.status}
              </StatusBadge>
            </li>)}
          </ul>}
  </Dialog>
}
