import { LoginForm } from '@/components/auth/login-form'
import { BrandMark } from '@/components/layout/brand-mark'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { vi } from '@/messages/vi'

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-brass">
          <BrandMark className="size-14" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-bold tracking-tight text-white">{vi.appName}</h1>
          <p className="text-[0.6875rem] font-semibold tracking-[0.18em] text-white/55 uppercase">
            Hệ thống quản lý trạm xăng dầu
          </p>
        </div>
      </div>
      <Card className="border-white/10 shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-base">{vi.auth.login}</CardTitle>
          <CardDescription>{vi.auth.loginSubtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-white/40">© Trường Thịnh · Hồ sơ Trạm</p>
    </div>
  )
}
