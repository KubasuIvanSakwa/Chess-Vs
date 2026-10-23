import React from 'react'
import Main from '../components/Main'

const Layout = () => {

  return (
    <div className='min-h-screen flex justify-center items-center bg-[#302e2b]'>
        {Main()}
    </div>
  )
}
export default Layout