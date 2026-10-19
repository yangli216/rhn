import type { PaymentConfigurationDescriptor } from '../../../shared/rhnApi'

export function paymentChannelLabel(channel: PaymentConfigurationDescriptor) {
  return channel.paymentMethodCodeText && channel.paymentMethodCodeText !== channel.paymentMethodCode
    ? channel.paymentMethodCodeText : channel.name
}
