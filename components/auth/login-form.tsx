'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { z } from 'zod'

import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'
import { vi } from '@/messages/vi'

const loginSchema = z.object({
  email: z.string().email(vi.auth.invalidEmail),
  password: z.string().min(1, vi.auth.passwordRequired),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: LoginValues) {
    setIsSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })
    setIsSubmitting(false)

    if (error) {
      toast.error(vi.auth.loginFailed)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">{vi.auth.email}</FieldLabel>
          <Input id="email" type="email" autoComplete="email" {...register('email')} />
          {errors.email ? <FieldError>{errors.email.message}</FieldError> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="password">{vi.auth.password}</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
          />
          {errors.password ? <FieldError>{errors.password.message}</FieldError> : null}
        </Field>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? vi.auth.loggingIn : vi.auth.login}
        </Button>
      </FieldGroup>
    </form>
  )
}
