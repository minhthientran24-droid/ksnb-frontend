import Head from "next/head";
import "../styles/globals.css";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>KSNB Long Châu</title>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
