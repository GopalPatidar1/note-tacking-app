import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ForgotPasswordRequestSchema, type ForgotPasswordRequestDTO } from '@note-app/shared'
import { useForgotPassword } from '@/hooks/auth/use-forgot-password'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function ForgotPasswordPage() {
  const { mutate: forgotPassword, isPending, isSuccess } = useForgotPassword()

  const form = useForm<ForgotPasswordRequestDTO>({
    resolver: zodResolver(ForgotPasswordRequestSchema),
    defaultValues: { email: '' },
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Forgot password</CardTitle>
          <CardDescription>Enter your email to receive a reset OTP</CardDescription>
        </CardHeader>
        <CardContent>
          {isSuccess ? (
            <p className="text-sm text-muted-foreground">
              If that email exists, an OTP has been sent. Check your console (dev mode).
            </p>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => forgotPassword(data))}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? 'Sending…' : 'Send OTP'}
                </Button>
              </form>
            </Form>
          )}

          <p className="mt-4 text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">
              Back to sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
