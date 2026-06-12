import axios from 'axios'

const publicHttp = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
})

export { publicHttp }
